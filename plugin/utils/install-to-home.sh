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

# 1. .generated/ 에 settings.json 생성 (플레이스홀더 치환)
echo "[1/2] .generated/ 디렉토리에 settings.json 생성..."
for preset in claude-tdd claude-collab claude-full claude-minimal; do
  mkdir -p "$DEPLOY_DIR/.generated/$preset"
  sed "s|__PLUGIN_DIR__|$PLUGIN_DIR|g" \
    "$DEPLOY_DIR/$preset/settings.json" \
    > "$DEPLOY_DIR/.generated/$preset/settings.json"
  echo "      생성: plugin/deploy/.generated/$preset/settings.json"
done

# 2. ~/.agent-deck/config.toml 패치
echo "[2/2] ~/.agent-deck/config.toml 에 profiles 블록 추가..."
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
