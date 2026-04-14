---
name: plugin-presets
description: Manage Claude Code plugin combination presets (solo/tdd/collab/full). Use when user mentions "preset", "switch preset", "enable tdd", "enable chorus", "plugin combination", or needs to (1) choose which plugins to activate, (2) switch between presets, (3) understand subagent model strategy, (4) deploy preset to home directory for testing.
metadata:
  compatibility: "claude"
---

# Plugin Presets

Manage Claude Code plugin combinations via preset profiles.

**Base plugin (always active):** middlek — hooks, Serena MCP, session state

## Presets at a Glance

| Preset | Plugins | Subagent Model | Use When |
|--------|---------|---------------|----------|
| `minimal` | middlek | haiku | 빠른 작업, 토큰 절약 최우선 |
| `solo` | middlek + superpowers | haiku | 일반 개인 개발 (기본값) |
| `tdd` | middlek + superpowers + tdd-guard | **sonnet** | TDD 강제, 테스트 우선 개발 |
| `collab` | middlek + superpowers + chorus | **sonnet** | AI-DLC 협업, 다중 에이전트 팀 |
| `full` | middlek + superpowers + agent-deck | haiku | 로컬 풀스택, Codex/Gemini 상담 |

## Switching Presets

```bash
agent-deck             # default (solo) — ~/.claude 사용
agent-deck -p tdd      # tdd preset
agent-deck -p collab   # collab preset
agent-deck -p full     # full preset
agent-deck -p minimal  # minimal preset
```

agent-deck 프로필은 `~/.agent-deck/config.toml` 의 `[profiles.NAME.claude] config_dir` 로 설정됨.
배포 파일은 `plugin/deploy/` 에 있으며, 검증 시 `install-to-home.sh` 로 복사한다.

## Preset Workflows

### solo (default)

1. 세션 시작 → superpowers SessionStart 훅이 15개 스킬 컨텍스트 주입
2. 설계: `brainstorming` 스킬 → Socratic 정제 + (선택) brainstorm server 시각화
3. 계획: `writing-plans` 스킬 → 체크박스 태스크 분해
4. 구현: `subagent-driven-development` 스킬 → 서브에이전트 병렬 실행 (haiku)
5. 검증: `verification-before-completion` 스킬
6. `/clear` 후 컨텍스트 유지: `/catchup` → middlek session-state 복원

### tdd

**요구사항:** Node.js/npx, ANTHROPIC_API_KEY

1. `agent-deck -p tdd`
2. superpowers `test-driven-development` 스킬 → RED-GREEN-REFACTOR 원칙
3. 편집 시도 → tdd-guard PreToolUse 가로채기
   - 실패 케이스 분석 → AI로 TDD 준수 여부 판정
   - 위반: 블록 + 수정 가이드 / 통과: 정상 진행
4. 프로젝트 초기 1회: `tdd-guard.config.json` 으로 언어별 reporter 설정

> **주의:** tdd-guard UserPromptSubmit 훅이 모든 프롬프트에 실행 → 속도 트레이드오프

### collab (AI-DLC)

**요구사항:** CHORUS_URL, CHORUS_API_KEY, chorus 서버

```bash
export CHORUS_URL=https://your-chorus-server
export CHORUS_API_KEY=cho_your_key
agent-deck -p collab
```

워크플로우 (AI propose → human verify):
1. SessionStart: chorus checkin → 역할(PM/Developer) + 프로젝트 컨텍스트 주입
2. **PM 에이전트** (`Agent(model: "opus")` 권장):
   - Idea → Proposal → `chorus_pm_submit_proposal` MCP 호출
3. **Human:** chorus 대시보드에서 Proposal 검토 → approve/reject
4. **Developer 에이전트** (`Agent(model: "sonnet")`):
   - Task 체크인 → 구현 → `chorus_submit_for_verify` MCP 호출
5. SubagentStart: 서브에이전트에 role + session UUID 자동 주입

### full

**요구사항:** agent-deck 바이너리

1. `agent-deck` TUI → 세션 트리 시각화
2. `m` 키: MCP Manager → Serena + 작업별 exa/playwright attach
3. `s` 키: Skills Manager → superpowers 스킬 선택 attach
4. Codex 코드리뷰: `$SKILL_DIR/scripts/launch-subagent.sh "Review" "..." --tool codex --wait`
5. Gemini 아키텍처 상담: `--tool gemini --wait`

## Subagent Model Strategy

| Preset | CLAUDE_CODE_SUBAGENT_MODEL | 이유 |
|--------|--------------------------|------|
| minimal/solo/full | haiku | 빠른 연구·탐색 서브에이전트 |
| tdd | sonnet | TDD 검증 서브에이전트 품질 필요 |
| collab | sonnet | PM/Developer 역할 추론 복잡도 |

chorus PM 역할은 `Agent(model: "opus")` 명시 권장 — chorus SubagentStart 훅이 역할을 additionalContext로 주입하므로 메인 에이전트가 이를 확인 후 결정.

## Home Directory Deployment (Testing Only)

프리셋 배포 원본은 `plugin/deploy/` 에 있다. 홈 디렉토리는 검증 시에만 건드린다:

```bash
# 검증 전: 홈에 복사
bash plugin/utils/install-to-home.sh

# 검증 후: 즉시 복구
bash plugin/utils/restore-from-home.sh
```

배포 대상:
- `plugin/deploy/claude-tdd/settings.json` → `~/.claude-tdd/settings.json`
- `plugin/deploy/claude-collab/settings.json` → `~/.claude-collab/settings.json`
- `plugin/deploy/agent-deck-config-patch.toml` → `~/.agent-deck/config.toml` (profiles 블록 추가)

## Requirements Checklist

| Preset | 필수 사항 |
|--------|---------|
| solo | (없음) |
| tdd | `node`, `npx`, `ANTHROPIC_API_KEY` |
| collab | `CHORUS_URL`, `CHORUS_API_KEY`, chorus 서버 |
| full | `agent-deck` CLI 설치 |

## Preset Files

모든 프리셋 정의: `plugin/deploy/claude-*/settings.json`
