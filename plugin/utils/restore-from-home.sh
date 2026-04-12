#!/usr/bin/env bash
# restore-from-home.sh — agent-deck 프로필 제거 (롤백)
#
# 동작:
#   1. ~/.agent-deck/config.toml 에서 middlek-presets 블록 제거
#   2. plugin/deploy/.generated/ 디렉토리 삭제
#
# 설치: bash plugin/utils/install-to-home.sh
#
# 사용법: bash plugin/utils/restore-from-home.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PLUGIN_DIR/plugin/deploy"

echo "=== restore-from-home.sh: agent-deck 프로필 제거 ==="
echo ""

# 1. ~/.agent-deck/config.toml 에서 middlek-presets 블록 제거
echo "[1/2] ~/.agent-deck/config.toml 에서 middlek-presets 블록 제거..."
if [ ! -f "$HOME/.agent-deck/config.toml" ]; then
  echo "      없음 (건너뜀)"
elif grep -q "BEGIN middlek-presets" "$HOME/.agent-deck/config.toml" 2>/dev/null; then
  python3 - <<'PYEOF'
import re, os

config_path = os.path.expanduser("~/.agent-deck/config.toml")
with open(config_path, "r") as f:
    content = f.read()

cleaned = re.sub(r'\n*# BEGIN middlek-presets.*?# END middlek-presets\n?', '', content, flags=re.DOTALL)

with open(config_path, "w") as f:
    f.write(cleaned.rstrip() + "\n")

print("      완료: middlek-presets 블록 제거됨")
PYEOF
else
  echo "      블록 없음 (건너뜀)"
fi

# 2. .generated/ 디렉토리 삭제
echo "[2/2] plugin/deploy/.generated/ 삭제..."
if [ -d "$DEPLOY_DIR/.generated" ]; then
  rm -rf "$DEPLOY_DIR/.generated"
  echo "      완료: .generated/ 삭제됨"
else
  echo "      없음 (건너뜀)"
fi

echo ""
echo "=== 제거 완료 ==="
