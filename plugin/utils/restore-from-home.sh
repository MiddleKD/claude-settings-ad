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

# 2. ~/.agent-deck/skills/pool/ 에서 middlek 스킬 심링크 제거
echo "[2/3] ~/.agent-deck/skills/pool/ 에서 middlek 스킬 심링크 제거..."
POOL_DIR="$HOME/.agent-deck/skills/pool"
SKILLS_SRC="$PLUGIN_DIR/plugin/skills"
if [ -d "$POOL_DIR" ] && [ -d "$SKILLS_SRC" ]; then
  for skill_dir in "$SKILLS_SRC"/*/; do
    skill_name="$(basename "$skill_dir")"
    link_target="$POOL_DIR/$skill_name"
    if [ -L "$link_target" ]; then
      rm "$link_target"
      echo "      제거: pool/$skill_name"
    fi
  done
else
  echo "      건너뜀 (pool 또는 skills 디렉토리 없음)"
fi

# 3. ~/.codex/config.toml 에서 middlek-presets 블록 제거 + 기존 값 복원
echo "[3/3] ~/.codex/config.toml 에서 middlek-presets 블록 제거..."
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

# BEGIN/END 블록 제거
cleaned = re.sub(r'\n*# BEGIN middlek-presets.*?# END middlek-presets\n?', '', content, flags=re.DOTALL)

# patch 파일 헤더 주석 잔재 제거 (마커 없이 남겨진 경우 대비)
cleaned = re.sub(r'\n*# ~/.codex/config\.toml 에 추가할 블록 템플릿.*?# 마커 라인으로 구간을 식별하므로 수동 편집 시 마커를 보존해야 함\.\n?', '', cleaned, flags=re.DOTALL)

# 기존 값 복원: top-level 키이므로 파일 맨 앞에 삽입
if restore_lines:
    cleaned = "\n".join(restore_lines) + "\n" + cleaned.lstrip()

with open(config_path, "w") as f:
    f.write(cleaned.rstrip() + "\n")

print("      완료: middlek-presets 블록 제거" + (f", 복원: {', '.join(restore_lines)}" if restore_lines else ""))
PYEOF
else
  echo "      블록 없음 (건너뜀)"
fi

echo ""
echo "=== 제거 완료 ==="
echo ""
echo "plugin/deploy/.generated/ 는 유지됩니다."
echo "git pull 후 install-to-home.sh 를 실행하면 변경된 부분만 갱신됩니다."
