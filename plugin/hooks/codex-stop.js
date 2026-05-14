#!/usr/bin/env node
'use strict';

/**
 * Codex Stop hook — save session state (equivalent of session-end.js)
 *
 * Codex has no SessionEnd event; Stop fires when the conversation reaches
 * a natural stopping point. We save session state here so that the next
 * codex-session-start.js can restore context.
 *
 * Transcript format may differ from Claude Code; saveSessionState handles
 * parse failures gracefully (falls back to branch + timestamp only).
 */

const fs = require('fs');
const path = require('path');
const { saveSessionState } = require('./session-data-extractor');

function main() {
  let input = {};
  try {
    const raw = fs.readFileSync('/dev/stdin', 'utf8').trim();
    if (raw) input = JSON.parse(raw);
  } catch {
    // ignore: no stdin or parse error
  }

  const transcriptPath = input.transcript_path || null;
  saveSessionState(transcriptPath, 'codex-stop');
  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(`[codex-stop] error: ${err.message}\n`);
  process.exit(0);
}
