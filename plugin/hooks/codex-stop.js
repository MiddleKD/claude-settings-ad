#!/usr/bin/env node
'use strict';

/**
 * Codex Stop hook — save session state for next session's context restore.
 *
 * Codex has no SessionEnd event; Stop fires at natural conversation end.
 * Auto-discovers the session JSONL from ~/.codex/sessions/ and parses
 * Codex's own event format (differs from Claude Code transcript format).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_TURN_TEXT = 800;
const MAX_ENTRIES = 20;
const MAX_FILES = 30;

// FILE_WRITING_TOOLS: Codex tool names that write files (for modified-file tracking)
const FILE_WRITING_TOOLS = new Set([
  'write_file', 'edit_file', 'replace_content', 'insert_after_symbol',
  'insert_before_symbol', 'replace_symbol_body', 'safe_delete_symbol',
]);

function runGit(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 5000, cwd: process.cwd() }).trim();
  } catch {
    return null;
  }
}

function getProjectRoot() {
  return runGit('git rev-parse --show-toplevel') || process.cwd();
}

function findLatestSessionFile(cwd) {
  const sessionsBase = path.join(process.env.HOME || '', '.codex', 'sessions');
  const candidates = [];

  try {
    for (const year of fs.readdirSync(sessionsBase).sort().reverse()) {
      const yearDir = path.join(sessionsBase, year);
      if (!fs.statSync(yearDir).isDirectory()) continue;
      for (const month of fs.readdirSync(yearDir).sort().reverse()) {
        const monthDir = path.join(yearDir, month);
        if (!fs.statSync(monthDir).isDirectory()) continue;
        for (const day of fs.readdirSync(monthDir).sort().reverse()) {
          const dayDir = path.join(monthDir, day);
          if (!fs.statSync(dayDir).isDirectory()) continue;
          for (const f of fs.readdirSync(dayDir)) {
            if (f.endsWith('.jsonl')) candidates.push(path.join(dayDir, f));
          }
        }
      }
    }
  } catch {
    return null;
  }

  // Sort most-recent first by mtime
  candidates.sort((a, b) => {
    try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
  });

  // Find most recent session whose session_meta.cwd matches project root
  for (const file of candidates.slice(0, 30)) {
    try {
      const head = fs.readFileSync(file, 'utf8').split('\n').slice(0, 3);
      for (const line of head) {
        if (!line.trim()) continue;
        const d = JSON.parse(line);
        if (d.type === 'session_meta' && d.payload?.cwd === cwd) return file;
      }
    } catch {
      // ignore unreadable files
    }
  }

  return null;
}

function extractFromCodexSession(sessionPath) {
  const recentTurns = [];
  const filesModified = new Set();

  // Per-turn assistant buffer: collect agent_messages between user_messages,
  // then keep only the final_answer (or last commentary if no final_answer).
  let pendingAssistant = [];

  function flushAssistant() {
    if (pendingAssistant.length === 0) return;
    const finalAnswer = pendingAssistant.find(m => m.phase === 'final_answer');
    const chosen = finalAnswer || pendingAssistant[pendingAssistant.length - 1];
    if (chosen) recentTurns.push({ role: 'assistant', text: chosen.text.slice(0, MAX_TURN_TEXT) });
    pendingAssistant = [];
  }

  const lines = fs.readFileSync(sessionPath, 'utf8').split('\n').filter(Boolean);

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    const p = entry.payload;
    if (!p || typeof p !== 'object') continue;

    const pt = p.type;

    if (entry.type === 'event_msg') {
      if (pt === 'user_message') {
        flushAssistant();
        const text = (p.message || '').trim();
        if (text) recentTurns.push({ role: 'user', text: text.slice(0, MAX_TURN_TEXT) });
      } else if (pt === 'agent_message') {
        const text = (p.message || '').trim();
        if (text) pendingAssistant.push({ text, phase: p.phase || '' });
      }
    }

    // Track file modifications from function_call tool names
    if (entry.type === 'response_item' && pt === 'function_call') {
      if (FILE_WRITING_TOOLS.has(p.name)) {
        try {
          const args = typeof p.arguments === 'string' ? JSON.parse(p.arguments) : p.arguments;
          const filePath = args?.path || args?.file_path || args?.filename;
          if (filePath) filesModified.add(filePath);
        } catch {
          // ignore
        }
      }
    }
  }

  flushAssistant();

  return {
    recentTurns: recentTurns.slice(-MAX_ENTRIES),
    filesModified: Array.from(filesModified).slice(0, MAX_FILES),
  };
}

function main() {
  let input = {};
  try {
    const raw = fs.readFileSync('/dev/stdin', 'utf8').trim();
    if (raw) input = JSON.parse(raw);
  } catch {
    // ignore
  }

  const projectRoot = getProjectRoot();
  const branch = runGit('git branch --show-current') || 'unknown';

  // Find session: prefer stdin transcript_path, fall back to auto-discovery
  const sessionPath = input.transcript_path || findLatestSessionFile(projectRoot);

  let recentTurns = [];
  let filesModified = [];

  if (sessionPath && fs.existsSync(sessionPath)) {
    try {
      ({ recentTurns, filesModified } = extractFromCodexSession(sessionPath));
    } catch (err) {
      process.stderr.write(`[codex-stop] parse error: ${err.message}\n`);
    }
  } else {
    process.stderr.write('[codex-stop] no session file found\n');
  }

  if (recentTurns.length === 0 && filesModified.length === 0) {
    process.stderr.write('[codex-stop] no content to save\n');
    process.exit(0);
  }

  const sessionDir = path.join(projectRoot, '.serena', 'session-data');
  const sessionFile = path.join(sessionDir, `${path.basename(projectRoot)}-session.json`);

  const state = {
    project: path.basename(projectRoot),
    branch,
    cwd: projectRoot,
    timestamp: new Date().toISOString(),
    recentTurns,
    filesModified,
  };

  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2), 'utf8');
    process.stderr.write(`[codex-stop] checkpoint 저장: ${sessionFile}\n`);
  } catch (err) {
    process.stderr.write(`[codex-stop] 저장 실패: ${err.message}\n`);
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(`[codex-stop] error: ${err.message}\n`);
  process.exit(0);
}
