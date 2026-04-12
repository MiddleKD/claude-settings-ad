#!/usr/bin/env node
'use strict';

/**
 * PreCompact hook — 컴팩션 전 세션 상태 checkpoint 저장
 *
 * compact 직전에 현재 세션 상태를 {cwd}/.serena/session-data/ 에 저장.
 * session-end.js와 동일한 로직 — compaction으로 context 사라지기 전 최신 상태 보존.
 * 최근 3턴(user+assistant)과 수정된 파일 목록을 저장.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_TURN_TEXT = 500;
const MAX_FILES = 20;
const MAX_TURNS = 3;

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function extractFromTranscript(transcriptPath) {
  // 턴 = user 메시지 하나 + 그 뒤 이어지는 모든 assistant entry
  // 각 턴에서 마지막 assistant 텍스트만 보존
  const rawTurns = []; // { userText, assistantTexts[] }
  const filesModified = new Set();

  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === 'user' && !entry.isMeta) {
          const msg = entry.message;
          const text = typeof msg?.content === 'string'
            ? msg.content.trim()
            : Array.isArray(msg?.content)
              ? (msg.content.find(b => b.type === 'text')?.text ?? '').trim()
              : null;
          if (text) rawTurns.push({ userText: text.slice(0, MAX_TURN_TEXT), assistantTexts: [] });
        }

        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'text' && block.text?.trim() && rawTurns.length > 0) {
              rawTurns[rawTurns.length - 1].assistantTexts.push(block.text.trim());
            }
            if (block.type === 'tool_use' &&
                (block.name === 'Edit' || block.name === 'Write' || block.name === 'MultiEdit')) {
              const filePath = block.input?.file_path;
              if (filePath) filesModified.add(filePath);
            }
          }
        }
      } catch {
        // 파싱 실패한 줄은 무시
      }
    }
  } catch (err) {
    process.stderr.write(`[pre-compact] transcript 읽기 실패: ${err.message}\n`);
  }

  // 마지막 MAX_TURNS 쌍만 추출, 각 턴의 마지막 assistant 텍스트만 사용
  const recentTurns = rawTurns.slice(-MAX_TURNS).flatMap(t => {
    const result = [{ role: 'user', text: t.userText }];
    const lastAssistant = t.assistantTexts[t.assistantTexts.length - 1];
    if (lastAssistant) result.push({ role: 'assistant', text: lastAssistant.slice(0, MAX_TURN_TEXT) });
    return result;
  });

  return {
    recentTurns,
    filesModified: Array.from(filesModified).slice(0, MAX_FILES),
  };
}

async function main() {
  let stdinData = '';
  await new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { stdinData += chunk; });
    process.stdin.on('end', resolve);
  });

  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinData);
    transcriptPath = input.transcript_path;
  } catch {
    // transcript_path 없음
  }

  const projectRoot = getProjectRoot();
  const branch = runGit('git branch --show-current') || 'unknown';
  const sessionDir = path.join(projectRoot, '.serena', 'session-data');
  const sessionFile = path.join(sessionDir, `${path.basename(projectRoot)}-session.json`);

  let recentTurns = [];
  let filesModified = [];

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    ({ recentTurns, filesModified } = extractFromTranscript(transcriptPath));
  }

  if (recentTurns.length === 0 && filesModified.length === 0) {
    process.exit(0);
  }

  const state = {
    project: path.basename(projectRoot),
    branch,
    cwd: projectRoot,
    timestamp: new Date().toISOString(),
    recentTurns,
    filesModified,
  };

  try {
    ensureDir(sessionDir);
    fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2), 'utf8');
    process.stderr.write(`[pre-compact] checkpoint 저장: ${sessionFile}\n`);
  } catch (err) {
    process.stderr.write(`[pre-compact] 저장 실패: ${err.message}\n`);
  }

  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[pre-compact] 오류: ${err.message}\n`);
  process.exit(0);
});
