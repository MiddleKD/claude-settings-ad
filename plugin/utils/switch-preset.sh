#!/usr/bin/env bash
# switch-preset.sh — agent-deck 없이 현재 프로젝트 .claude/settings.json 프리셋 전환
#
# 사용법: bash plugin/utils/switch-preset.sh <preset>
#         preset: minimal | solo | tdd | collab | full
#
# 동작: preset JSON의 enabledPlugins + env(CLAUDE_CODE_SUBAGENT_MODEL)를
#       현재 프로젝트 .claude/settings.json 에 병합.
#       다른 env 값 (ANTHROPIC_MODEL 등) 은 보존.

set -e

PRESET="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRESETS_DIR="$(cd "$SCRIPT_DIR/../presets" && pwd)"
SETTINGS_FILE="$(cd "$SCRIPT_DIR/../.." && pwd)/.claude/settings.json"

if [ -z "$PRESET" ]; then
  echo "사용법: bash plugin/utils/switch-preset.sh <preset>"
  echo "프리셋 목록:"
  for f in "$PRESETS_DIR"/*.json; do
    name=$(python3 -c "import json; d=json.load(open('$f')); print(f\"  {d['preset']:10} — {d['description']}\")" 2>/dev/null || true)
    echo "$name"
  done
  exit 1
fi

PRESET_FILE="$PRESETS_DIR/$PRESET.json"
if [ ! -f "$PRESET_FILE" ]; then
  echo "오류: 프리셋 '$PRESET' 을 찾을 수 없습니다. ($PRESET_FILE)"
  exit 1
fi

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "오류: settings.json 을 찾을 수 없습니다. ($SETTINGS_FILE)"
  exit 1
fi

echo "프리셋 전환: $PRESET"
echo "  설정 파일: $SETTINGS_FILE"
echo "  프리셋 파일: $PRESET_FILE"
echo ""

python3 - <<PYEOF
import json

with open("$SETTINGS_FILE") as f:
    settings = json.load(f)

with open("$PRESET_FILE") as f:
    preset = json.load(f)

# enabledPlugins 교체
settings["enabledPlugins"] = preset["enabledPlugins"]

# env 병합: CLAUDE_CODE_SUBAGENT_MODEL 만 교체, 나머지 보존
if "env" not in settings:
    settings["env"] = {}

preset_env = preset.get("env", {})
if "CLAUDE_CODE_SUBAGENT_MODEL" in preset_env:
    settings["env"]["CLAUDE_CODE_SUBAGENT_MODEL"] = preset_env["CLAUDE_CODE_SUBAGENT_MODEL"]

with open("$SETTINGS_FILE", "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"완료: enabledPlugins → {preset['preset']} 프리셋")
print(f"      CLAUDE_CODE_SUBAGENT_MODEL → {preset_env.get('CLAUDE_CODE_SUBAGENT_MODEL', '변경 없음')}")
if preset.get("requires"):
    print(f"      요구사항: {', '.join(preset['requires'])}")
PYEOF

echo ""
echo "적용됨: $PRESET"
echo "Claude Code를 재시작하면 새 플러그인 조합이 로드됩니다."
