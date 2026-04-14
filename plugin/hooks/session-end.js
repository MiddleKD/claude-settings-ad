#!/usr/bin/env node
'use strict';

/**
 * SessionEnd hook — 세션 종료시 최종 상태 저장
 *
 * 세션 종료 시 실행. transcript에서 최근 10 entries(user+assistant)와
 * 수정된 파일 목록을 추출해 {cwd}/.serena/session-data/ 에 저장.
 * pre-compact.js와 동일한 로직 사용.
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

  saveSessionState(transcriptPath, 'session-end');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[session-end] 오류: ${err.message}\n`);
  process.exit(0);
});