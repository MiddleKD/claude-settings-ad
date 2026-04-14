#!/usr/bin/env node
'use strict';

/**
 * PreCompact hook — 컴팩션 전 세션 상태 checkpoint 저장
 *
 * compact 직전에 현재 세션 상태를 {cwd}/.serena/session-data/ 에 저장.
 * session-end.js와 동일한 로직 — compaction으로 context 사라지기 전 최신 상태 보존.
 * 최근 10 entries(user+assistant)와 수정된 파일 목록을 저장 (session-end.js와 동일 로직).
 */

const { saveSessionState } = require('./session-data-extractor');

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

  saveSessionState(transcriptPath, 'pre-compact');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[pre-compact] 오류: ${err.message}\n`);
  process.exit(0);
});
