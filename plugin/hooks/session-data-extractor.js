#!/usr/bin/env node
'use strict';

/**
 * session-data-extractor.js — 세션 데이터 추출 공통 로직
 *
 * pre-compact.js와 session-end.js에서 공유하는 transcript 파싱 및 상태 저장 로직.
 * 두 훅이 완전히 동일한 방식으로 데이터를 처리하도록 보장.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_TURN_TEXT = 800;  // 500 → 800: 긴 설명/코드도 커버
const MAX_FILES = 30;       // 20 → 30: 대규모 리팩터링 대응
const MAX_ENTRIES = 20;     // 10 → 20: 10-15턴 맥락 (더 풍부한 대화 기록)

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
          if (text && !text.startsWith('This session is being continued from')) {
            rawTurns.push({ userText: text.slice(0, MAX_TURN_TEXT), assistantTexts: [] });
          }
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
    throw new Error(`transcript 읽기 실패: ${err.message}`);
  }

  // 모든 턴을 펼치고 마지막 MAX_ENTRIES개만 보존
  const allEntries = rawTurns.flatMap(t => {
    const result = [{ role: 'user', text: t.userText }];
    for (const text of t.assistantTexts) {
      result.push({ role: 'assistant', text: text.slice(0, MAX_TURN_TEXT) });
    }
    return result;
  });
  const recentTurns = allEntries.slice(-MAX_ENTRIES);

  return {
    recentTurns,
    filesModified: Array.from(filesModified).slice(0, MAX_FILES),
  };
}

function saveSessionState(transcriptPath, hookName) {
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
    return false; // 저장할 내용 없음
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
    process.stderr.write(`[${hookName}] checkpoint 저장: ${sessionFile}\n`);
    return true;
  } catch (err) {
    process.stderr.write(`[${hookName}] 저장 실패: ${err.message}\n`);
    return false;
  }
}

module.exports = {
  saveSessionState,
  extractFromTranscript,
  getProjectRoot,
  MAX_TURN_TEXT,
  MAX_FILES,
  MAX_ENTRIES,
};