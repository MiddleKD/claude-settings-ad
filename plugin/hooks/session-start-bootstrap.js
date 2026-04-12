#!/usr/bin/env node
'use strict';

/**
 * session-start-bootstrap.js
 *
 * Bootstrap loader for the SessionStart hook.
 *
 * 문제: hooks.json에서 ${CLAUDE_PLUGIN_ROOT} 환경변수를 사용하는데,
 * directory-source 플러그인에서는 Claude Code가 CLAUDE_PLUGIN_ROOT를 주입하지 않아
 * 경로가 깨져 "node:internal/modules/cjs/loader" 에러 발생.
 *
 * 해결: 이 bootstrap 파일을 절대경로로 참조하고,
 * __dirname으로 플러그인 루트를 자동 탐색한 뒤 실제 스크립트에 위임.
 *
 * 루트 탐색 우선순위:
 *   1. CLAUDE_PLUGIN_ROOT 환경변수 (마켓플레이스 캐시 설치 시 Claude Code가 주입)
 *   2. __dirname 기반 자동 탐색 (이 파일은 항상 <root>/plugin/hooks/ 에 위치)
 *   3. ~/.claude/plugins/cache/middlek-settings/ 하위 자동 스캔
 *   4. ~/.claude/ 폴백
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 확인 프로브: 이 파일은 <CLAUDE_PLUGIN_ROOT>/hooks/ 에 위치
// CLAUDE_PLUGIN_ROOT = <project>/plugin/
const PROBE = path.join('hooks', 'session-start.js');

function hasProbe(candidate) {
  try {
    return fs.existsSync(path.join(candidate, PROBE));
  } catch {
    return false;
  }
}

function resolvePluginRoot() {
  // 1순위: CLAUDE_PLUGIN_ROOT 환경변수
  const envRoot = (process.env.CLAUDE_PLUGIN_ROOT || '').trim();
  if (envRoot && hasProbe(envRoot)) {
    return envRoot;
  }

  // 2순위: __dirname 기반 (이 파일은 항상 <CLAUDE_PLUGIN_ROOT>/hooks/ 에 위치)
  // __dirname = <CLAUDE_PLUGIN_ROOT>/hooks → 한 단계 상위 = CLAUDE_PLUGIN_ROOT
  const dirnameBased = path.resolve(__dirname, '..');
  if (hasProbe(dirnameBased)) {
    return dirnameBased;
  }

  // 3순위: ~/.claude/plugins/cache/middlek-settings/<org>/<version>/plugin/ 스캔
  try {
    const cacheBase = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'middlek-settings');
    const orgs = fs.readdirSync(cacheBase, { withFileTypes: true });
    for (const org of orgs) {
      if (!org.isDirectory()) continue;
      const versions = fs.readdirSync(path.join(cacheBase, org.name), { withFileTypes: true });
      for (const ver of versions) {
        if (!ver.isDirectory()) continue;
        const candidate = path.join(cacheBase, org.name, ver.name, 'plugin');
        if (hasProbe(candidate)) return candidate;
      }
    }
  } catch {
    // cache 없으면 무시
  }

  // 4순위: ~/.claude/ 폴백
  return path.join(os.homedir(), '.claude');
}

function main() {
  const root = resolvePluginRoot();
  const target = path.join(root, PROBE);

  if (!fs.existsSync(target)) {
    process.stderr.write(
      `[session-start-bootstrap] ERROR: session-start.js not found (resolved root: ${root})\n`
    );
    process.exit(0); // non-blocking: 훅 오류가 세션을 막지 않도록
  }

  require(target);
}

main();
