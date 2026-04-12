#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook — 이전 세션 상태 주입
 *
 * 세션 시작 시 {cwd}/.serena/session-data/{project-basename}-session.json 을 읽어
 * 이전 세션 컨텍스트를 additionalContext로 주입. 7일 초과 파일은 무시.
 * Serena memory에 없는 내용이 있으면 write_memory로 저장하도록 Claude에게 지시.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일

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

  const lines = [];

  // 이전 세션 상태 (파일 있을 때만)
  let state = null;
  if (fs.existsSync(sessionFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      const age = parsed.timestamp ? Date.now() - new Date(parsed.timestamp).getTime() : 0;
      if (age <= MAX_AGE_MS) {
        state = parsed;
      }
    } catch {
      // 무시
    }
  }

  // 이전 세션 데이터 (2단계에서 참고용)
  if (state) {
    lines.push(`[이전 세션 데이터 - 2단계에서 참고]`);
    lines.push(`타임스탬프: ${state.timestamp || '알 수 없음'}`);
    lines.push(`브랜치: ${state.branch || 'unknown'}`);

    if (Array.isArray(state.recentTurns) && state.recentTurns.length > 0) {
      lines.push('');
      lines.push('최근 대화:');
      for (const turn of state.recentTurns) {
        const prefix = turn.role === 'user' ? 'User' : 'Assistant';
        lines.push(`[${prefix}] ${turn.text}`);
      }
    } else if (state.lastAssistantMessage) {
      lines.push(`마지막 응답: ${state.lastAssistantMessage}`);
    }

    if (Array.isArray(state.filesModified) && state.filesModified.length > 0) {
      lines.push('');
      lines.push(`수정된 파일: ${state.filesModified.join(', ')}`);
    }
    lines.push('');
  }

  // 환경변수로 메모리 제한 설정
  const MAX_MEMORY_FILES = parseInt(process.env.SERENA_MAX_MEMORY_FILES || '10', 10);
  const MAX_MEMORY_LINES = parseInt(process.env.SERENA_MAX_MEMORY_LINES || '100', 10);

  // onboarding 여부를 파일시스템으로 판단 + 제한 초과 파일 수집
  const memoriesDir = path.join(projectRoot, '.serena', 'memories');
  let memoriesExist = false;
  let memoryFileCount = 0;
  const oversizedFiles = []; // 라인 수 초과 파일 목록
  try {
    if (fs.existsSync(memoriesDir)) {
      const mdFiles = fs.readdirSync(memoriesDir).filter(f => f.endsWith('.md'));
      memoryFileCount = mdFiles.length;
      memoriesExist = memoryFileCount > 0;

      for (const f of mdFiles) {
        try {
          const content = fs.readFileSync(path.join(memoriesDir, f), 'utf8');
          const lineCount = content.split('\n').length;
          if (lineCount > MAX_MEMORY_LINES) {
            oversizedFiles.push({ name: f.replace(/\.md$/, ''), lines: lineCount });
          }
        } catch {
          // 무시
        }
      }
    }
  } catch {
    // 무시
  }

  const fileCountExceeded = memoryFileCount > MAX_MEMORY_FILES;

  // 세션 초기화 순서 — 항상 실행
  lines.push('아래 순서대로 세션을 초기화하라:');
  if (!memoriesExist) {
    lines.push('1. [onboarding] mcp__serena__onboarding 실행');
  } else {
    lines.push('1. [onboarding] 이미 완료됨 — 다음 단계');
  }
  lines.push('2. [컨텍스트 로드] mcp__serena__list_memories 실행 → 현재 프로젝트 context 복원');
  lines.push('3. [메모리 반영] 이전 세션 데이터가 아래 체크리스트를 충족할 때만 mcp__serena__write_memory 실행:\n   - [ ] 매우 중요한 아키텍처 결정/컨벤션/트레이드오프가 발생\n   - [ ] memory에 없는 내용 추가 (있으면 저장 금지)\n   - [ ] memory와 모순되는 변경사항 반영');

  // 제한 초과 시 정리 지시 추가
  if (fileCountExceeded || oversizedFiles.length > 0) {
    const cleanupReasons = [];
    if (fileCountExceeded) {
      cleanupReasons.push(`메모리 파일 수 ${memoryFileCount}개가 상한(${MAX_MEMORY_FILES}개)을 초과`);
    }
    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles.map(f => `${f.name}(${f.lines}줄)`).join(', ');
      cleanupReasons.push(`라인 수 상한(${MAX_MEMORY_LINES}줄) 초과 파일: ${fileList}`);
    }
    lines.push(`4. [메모리 정리] ${cleanupReasons.join(' / ')}\n   - 파일 수 초과: mcp__serena__delete_memory로 중복/오래된 항목 삭제 후 관련 항목 통합\n   - 라인 초과: mcp__serena__edit_memory로 해당 파일의 중복·오래된 내용 압축`);
  }

  const additionalContext = lines.join('\n');

  const output = {
    systemMessage: '🚀 Prepare session...',
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
  process.stderr.write(`[session-start] 오류: ${err.message}\n`);
  process.exit(0);
}
