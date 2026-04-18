#!/usr/bin/env bash
# install-to-home.sh — agent-deck 프로필 설치
#
# 동작:
#   1. plugin/deploy/.generated/ 에 settings.json 생성 (경로 치환)
#   2. ~/.agent-deck/config.toml 에 middlek-presets 블록 추가
#
# 제거: bash plugin/utils/restore-from-home.sh
#
# 사용법: bash plugin/utils/install-to-home.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PLUGIN_DIR/plugin/deploy"

echo "=== install-to-home.sh: agent-deck 프로필 설치 ==="
echo "PLUGIN_DIR: $PLUGIN_DIR"
echo ""

# 1. .generated/ 에 settings.json 생성 (플레이스홀더 치환 + hooks.json 병합)
echo "[1/2] .generated/ 디렉토리에 settings.json 생성..."
for preset in claude-tdd claude-collab claude-full claude-minimal; do
  mkdir -p "$DEPLOY_DIR/.generated/$preset"
  python3 - "$DEPLOY_DIR/$preset" "$DEPLOY_DIR/.generated/$preset" "$PLUGIN_DIR" <<'PYEOF'
import sys, json, re

src_dir, dst_dir, plugin_dir = sys.argv[1], sys.argv[2], sys.argv[3]

def replace(text):
    return text.replace("__PLUGIN_DIR__", plugin_dir)

with open(f"{src_dir}/settings.json") as f:
    settings = json.loads(replace(f.read()))

hooks_path = f"{src_dir}/hooks.json"
try:
    with open(hooks_path) as f:
        hooks_data = json.loads(replace(f.read()))
    if hooks_data.get("hooks"):
        existing = settings.get("hooks", {})
        for event, matchers in hooks_data["hooks"].items():
            existing.setdefault(event, []).extend(matchers)
        settings["hooks"] = existing
except FileNotFoundError:
    pass

with open(f"{dst_dir}/settings.json", "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
  hooks_note=""
  [ -f "$DEPLOY_DIR/$preset/hooks.json" ] && hooks_note=" (hooks.json 병합됨)"
  echo "      생성: plugin/deploy/.generated/$preset/settings.json$hooks_note"
done

# 2. ~/.agent-deck/config.toml 패치
echo "[2/4] ~/.agent-deck/config.toml 에 profiles 블록 추가..."
if [ ! -f "$HOME/.agent-deck/config.toml" ]; then
  echo "      주의: ~/.agent-deck/config.toml 이 없습니다. agent-deck 를 먼저 설치하세요."
  echo "      profiles 블록 추가를 건너뜁니다."
elif grep -q "BEGIN middlek-presets" "$HOME/.agent-deck/config.toml" 2>/dev/null; then
  echo "      이미 병합됨 — 건너뜁니다."
else
  echo "" >> "$HOME/.agent-deck/config.toml"
  sed "s|__PLUGIN_DIR__|$PLUGIN_DIR|g" \
    "$DEPLOY_DIR/agent-deck-config-patch.toml" \
    >> "$HOME/.agent-deck/config.toml"
  echo "      완료: profiles.tdd, collab, full, minimal 추가됨"
fi

# 3. ~/.agent-deck/skills/pool/ 에 middlek 스킬 심링크 생성
echo "[3/4] ~/.agent-deck/skills/pool/ 에 middlek 스킬 심링크 추가..."
POOL_DIR="$HOME/.agent-deck/skills/pool"
if [ -d "$POOL_DIR" ]; then
  for skill_dir in "$PLUGIN_DIR/plugin/skills"/*/; do
    skill_name="$(basename "$skill_dir")"
    link_target="$POOL_DIR/$skill_name"
    if [ -L "$link_target" ]; then
      echo "      이미 있음: pool/$skill_name (건너뜀)"
    elif [ -e "$link_target" ]; then
      echo "      경고: pool/$skill_name 이 이미 존재함 (실제 파일, 건너뜀)"
    else
      ln -sf "$skill_dir" "$link_target"
      echo "      심링크 생성: pool/$skill_name -> $skill_dir"
    fi
  done
else
  echo "      주의: $POOL_DIR 없음 — agent-deck 먼저 실행해주세요."
fi

# 4. ~/.codex/config.toml 패치
echo "[4/4] ~/.codex/config.toml 에 codex 설정 추가..."
mkdir -p "$HOME/.codex"
if grep -q "BEGIN middlek-presets" "$HOME/.codex/config.toml" 2>/dev/null; then
  echo "      이미 병합됨 — 건너뜁니다."
else
  python3 - "$HOME/.codex/config.toml" "$DEPLOY_DIR/codex-config-patch.toml" "$PLUGIN_DIR" <<'PYEOF'
import sys, os, re

config_path, patch_path, plugin_dir = sys.argv[1], sys.argv[2], sys.argv[3]

# patch 파일을 직접 읽고 플레이스홀더 치환
with open(patch_path, "r") as f:
    patch_full = f.read().replace("__PLUGIN_DIR__", plugin_dir)

# BEGIN~END 블록만 추출 (파일 헤더 주석 제외)
m = re.search(r'(# BEGIN middlek-presets.*?# END middlek-presets)', patch_full, flags=re.DOTALL)
patch = m.group(1) if m else patch_full.strip()

if os.path.exists(config_path):
    with open(config_path, "r") as f:
        content = f.read()
else:
    content = ""

# 기존 top-level 키 값을 주석으로 백업 (^key= 만 매칭, model_provider 등 오매칭 방지)
backup_lines = []
for key in ("model", "model_reasoning_effort"):
    m = re.search(rf'(?m)^{key}\s*=.*', content)
    if m:
        backup_lines.append(f"# _backup_{key} = {m.group().split('=', 1)[1].strip()}")
        content = re.sub(rf'(?m)^{key}\s*=.*\n?', '', content)

# 백업 주석을 BEGIN 마커 바로 다음에 삽입
patch_with_backup = patch.replace(
    "# BEGIN middlek-presets",
    "# BEGIN middlek-presets" + ("\n" + "\n".join(backup_lines) if backup_lines else "")
)

with open(config_path, "w") as f:
    f.write(content.rstrip() + "\n\n" + patch_with_backup.strip() + "\n")

print("      완료: model, model_reasoning_effort, projects trust_level 추가됨")
PYEOF
fi

echo ""
echo "=== 설치 완료 ==="
echo ""
echo "이제 다음 명령으로 프로필 전환 가능:"
echo "  agent-deck -p tdd      # TDD 강제"
echo "  agent-deck -p collab   # AI-DLC 협업"
echo "  agent-deck -p full     # Codex 포함 풀스택"
echo "  agent-deck -p minimal  # 토큰 절약"
echo ""
echo "제거: bash plugin/utils/restore-from-home.sh"
