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

# 2. ~/.codex/config.toml 에서 middlek-presets 블록 제거 + 기존 값 복원
echo "[2/3] ~/.codex/config.toml 에서 middlek-presets 블록 제거..."
if [ ! -f "$HOME/.codex/config.toml" ]; then
  echo "      없음 (건너뜀)"
elif grep -q "BEGIN middlek-presets" "$HOME/.codex/config.toml" 2>/dev/null; then
  python3 - <<'PYEOF'
import re, os

config_path = os.path.expanduser("~/.codex/config.toml")
with open(config_path, "r") as f:
    content = f.read()

# 백업 주석에서 기존 값 추출
block_m = re.search(r'# BEGIN middlek-presets.*?# END middlek-presets', content, flags=re.DOTALL)
restore_lines = []
if block_m:
    for m in re.finditer(r'# _backup_(\w+) = (.+)', block_m.group()):
        restore_lines.append(f"{m.group(1)} = {m.group(2)}")

# 블록 제거
cleaned = re.sub(r'\n*# BEGIN middlek-presets.*?# END middlek-presets\n?', '', content, flags=re.DOTALL)

# 기존 값 복원
if restore_lines:
    cleaned = cleaned.rstrip() + "\n" + "\n".join(restore_lines) + "\n"

with open(config_path, "w") as f:
    f.write(cleaned.rstrip() + "\n")

print("      완료: middlek-presets 블록 제거" + (f", 복원: {', '.join(restore_lines)}" if restore_lines else ""))
PYEOF
else
  echo "      블록 없음 (건너뜀)"
fi

# 3. .generated/ 디렉토리 삭제
echo "[3/3] plugin/deploy/.generated/ 삭제..."
if [ -d "$DEPLOY_DIR/.generated" ]; then
  rm -rf "$DEPLOY_DIR/.generated"
  echo "      완료: .generated/ 삭제됨"
else
  echo "      없음 (건너뜀)"
fi

echo ""
echo "=== 제거 완료 ==="
