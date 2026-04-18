#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook — inject previous session state
 *
 * Reads {cwd}/.serena/session-data/{project-basename}-session.json on session start
 * and injects previous session context as additionalContext. Files older than 7 days are ignored.
 * Instructs Claude to call write_memory if there is content not yet in Serena memory.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

function main() {
  const projectRoot = getProjectRoot();
  const sessionDir = path.join(projectRoot, '.serena', 'session-data');
  const sessionFile = path.join(sessionDir, `${path.basename(projectRoot)}-session.json`);

  // Auto-initialize .serena/project.yml from template if missing
  const serenaDir = path.join(projectRoot, '.serena');
  const projectYml = path.join(serenaDir, 'project.yml');
  const templateYml = path.join(__dirname, '../../.serena/project.yml');
  if (!fs.existsSync(projectYml) && fs.existsSync(templateYml)) {
    try {
      fs.mkdirSync(serenaDir, { recursive: true });
      fs.copyFileSync(templateYml, projectYml);
    } catch {
      // ignore
    }
  }

  const lines = [];

  // Profile CLAUDE.md — copy to project's .claude/CLAUDE.md
  let profileCopied = false;
  let profileUserModified = false;
  const profile = process.env.CLAUDE_PROFILE;
  if (profile) {
    const src = path.join(__dirname, '../deploy', `claude-${profile}`, 'CLAUDE.md');
    if (fs.existsSync(src)) {
      const srcContent = fs.readFileSync(src, 'utf8');
      const srcHash = sha256(srcContent);
      const destDir = path.join(projectRoot, '.claude');
      const dest = path.join(destDir, 'CLAUDE.md');
      const hashFile = path.join(destDir, '.profile-claude-md.sha');

      let destHash = null;
      try { destHash = sha256(fs.readFileSync(dest, 'utf8')); } catch { /* not yet */ }
      let savedHash = null;
      try { savedHash = fs.readFileSync(hashFile, 'utf8').trim(); } catch { /* not yet */ }

      if (srcHash === destHash) {
        // up to date, nothing to do
      } else if (destHash === null || savedHash === null || savedHash === destHash) {
        // dest missing OR no tracking record (sha deleted = force) OR unmodified since last copy → safe to overwrite
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(dest, srcContent, 'utf8');
        fs.writeFileSync(hashFile, srcHash, 'utf8');
        profileCopied = true;
      } else {
        // user modified the file → skip, warn
        profileUserModified = true;
      }
    }
  }

  // Previous session state (only when file exists)
  let state = null;
  if (fs.existsSync(sessionFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      const age = parsed.timestamp ? Date.now() - new Date(parsed.timestamp).getTime() : 0;
      if (age <= MAX_AGE_MS) {
        state = parsed;
      }
    } catch {
      // ignore
    }
  }

  // Previous session data (for reference in step 3)
  if (state) {
    lines.push(`[Previous session data — reference in step 3]`);
    lines.push(`Timestamp: ${state.timestamp || 'unknown'}`);
    lines.push(`Branch: ${state.branch || 'unknown'}`);

    if (Array.isArray(state.recentTurns) && state.recentTurns.length > 0) {
      lines.push('');
      lines.push('Recent turns:');
      for (const turn of state.recentTurns) {
        const prefix = turn.role === 'user' ? 'User' : 'Assistant';
        lines.push(`[${prefix}] ${turn.text}`);
      }
    } else if (state.lastAssistantMessage) {
      lines.push(`Last response: ${state.lastAssistantMessage}`);
    }

    if (Array.isArray(state.filesModified) && state.filesModified.length > 0) {
      lines.push('');
      lines.push(`Modified files: ${state.filesModified.join(', ')}`);
    }
    lines.push('');
  }

  // Memory limits via env vars
  const MAX_MEMORY_FILES = parseInt(process.env.SERENA_MAX_MEMORY_FILES || '10', 10);
  const MAX_MEMORY_LINES = parseInt(process.env.SERENA_MAX_MEMORY_LINES || '100', 10);

  // Determine onboarding status from filesystem + collect oversized files
  const memoriesDir = path.join(projectRoot, '.serena', 'memories');
  let memoriesExist = false;
  let memoryFileCount = 0;
  const oversizedFiles = []; // files exceeding line limit

  function collectMdFiles(dir) {
    const results = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...collectMdFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath);
        }
      }
    } catch {
      // ignore
    }
    return results;
  }

  try {
    if (fs.existsSync(memoriesDir)) {
      const mdFiles = collectMdFiles(memoriesDir);
      memoryFileCount = mdFiles.length;
      memoriesExist = memoryFileCount > 0;

      for (const fullPath of mdFiles) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lineCount = content.split('\n').length;
          if (lineCount > MAX_MEMORY_LINES) {
            const rel = path.relative(memoriesDir, fullPath).replace(/\.md$/, '');
            oversizedFiles.push({ name: rel, lines: lineCount });
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  const fileCountExceeded = memoryFileCount > MAX_MEMORY_FILES;

  // Session init sequence — always runs
  lines.push('Initialize the session in order:');
  if (!memoriesExist) {
    lines.push('1. [onboarding] run mcp__serena__onboarding');
  } else {
    lines.push('1. [onboarding] already done — skip');
  }
  lines.push('2. [load context] run mcp__serena__list_memories → restore project context');
  lines.push('3. [changes] quick-scan previous session data above — no deep investigation, screening only');
  lines.push('4. [memory] Check each item below. If ANY apply, run mcp__serena__write_memory:\n   - Did you make architectural decisions, establish conventions, or choose trade-offs?\n   - Did you discover important information not currently stored in memory?\n   - Did you find contradictions with existing memory content?\n   Note: This is a required check - memory updates preserve context for future sessions.');

  // Add cleanup instruction if limits exceeded
  if (fileCountExceeded || oversizedFiles.length > 0) {
    const cleanupReasons = [];
    if (fileCountExceeded) {
      cleanupReasons.push(`memory file count ${memoryFileCount} exceeds limit (${MAX_MEMORY_FILES})`);
    }
    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles.map(f => `${f.name}(${f.lines} lines)`).join(', ');
      cleanupReasons.push(`files exceeding line limit (${MAX_MEMORY_LINES}): ${fileList}`);
    }
    lines.push(`5. [memory compact] ${cleanupReasons.join(' / ')}\n   - too many files: delete duplicates/stale with mcp__serena__delete_memory, merge related entries\n   - oversized files: compress duplicates/stale content with mcp__serena__edit_memory`);
  }

  const additionalContext = lines.join('\n');

  const systemMessage = profileCopied
    ? `🚀 Prepare session... ⚠️ Profile CLAUDE.md updated (${profile}) — takes effect from NEXT session`
    : profileUserModified
      ? `🚀 Prepare session... ⚠️ Profile CLAUDE.md (${profile}) skipped — local .claude/CLAUDE.md has user modifications`
      : '🚀 Prepare session...';

  const output = {
    systemMessage,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  };

  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(`[session-start] error: ${err.message}\n`);
  process.exit(0);
}
