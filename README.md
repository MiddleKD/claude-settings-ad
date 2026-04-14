# claude-settings-ad

middlek의 Claude Code 개인 설정 저장소. 플러그인 조합을 프리셋으로 관리한다.

## 설치 / 제거

```bash
# 설치 (원라인)
git clone https://github.com/MiddleKD/claude-settings-ad.git ~/.claude/$(whoami)_settings && bash ~/.claude/$(whoami)_settings/plugin/utils/install-to-home.sh

# 제거 (원라인)
bash ~/.claude/$(whoami)_settings/plugin/utils/restore-from-home.sh && rm -rf ~/.claude/$(whoami)_settings
```

install 스크립트가 `plugin/deploy/.generated/` 에 경로가 치환된 settings.json을 생성하고,
`~/.agent-deck/config.toml` 에 profiles 블록을 추가한다.

## 구조

```
.claude/
└── settings.json          # Claude Code 전역 설정 (extraKnownMarketplaces, enabledPlugins)

plugin/                    # middlek 플러그인 (항상 활성)
├── hooks/                 # 훅 정의 + 훅 실행 스크립트 (JS)
│   ├── hooks.json         # 훅 이벤트 → 커맨드 매핑
│   ├── session-start-bootstrap.js
│   ├── session-start.js
│   ├── session-end.js
│   └── pre-compact.js
├── utils/                 # 독립 실행 유틸리티 (sh)
│   ├── install-to-home.sh # 검증용 홈 배포
│   └── restore-from-home.sh
├── deploy/                # 홈 디렉토리 배포 대상 파일 (source of truth)
└── skills/plugin-presets/ # 프리셋 사용 가이드 스킬

```

## 플러그인 프리셋

middlek은 항상 활성. 나머지 플러그인은 상황에 따라 조합해서 사용한다.

| 프리셋 | 활성 플러그인 | 서브에이전트 모델 | 언제 |
|--------|-------------|----------------|------|
| `minimal` | middlek | haiku | 빠른 작업, 토큰 절약 |
| `solo` | middlek + superpowers | haiku | 일반 개인 개발 **(기본값)** |
| `tdd` | middlek + superpowers + tdd-guard | sonnet | TDD 강제, 테스트 우선 |
| `collab` | middlek + superpowers + chorus | sonnet | AI-DLC 협업 팀 |
| `full` | middlek + superpowers + agent-deck + codex | haiku | 로컬 풀스택, Codex/Gemini 상담 |

### 전환 방법

```bash
agent-deck              # solo (기본) — ~/.claude
agent-deck -p tdd       # TDD 강제
agent-deck -p collab    # AI-DLC 협업
agent-deck -p full      # Codex 포함 풀스택
agent-deck -p minimal   # 토큰 절약
```

## middlek 플러그인 기능

| 훅 | 동작 |
|----|------|
| SessionStart | usage limit 모니터링 + session-state 복원 (Serena) |
| SessionEnd | session-state 저장 |
| PreCompact | 컴팩트 전 중요 컨텍스트 보존 |
| SubagentStart | 서브에이전트에 advisor 호출 가이드 주입 |

**MCP:** Serena (LSP 기반 코드 탐색 + 프로젝트 메모리)

## 각 플러그인 요구사항

| 플러그인 | 요구사항 |
|---------|---------|
| tdd-guard | Node.js/npx, `ANTHROPIC_API_KEY` |
| chorus | `CHORUS_URL`, `CHORUS_API_KEY`, chorus 서버 |
| agent-deck | `agent-deck` CLI 바이너리 |

## 시작하기 전에

### 필수

```bash
# ripgrep (Claude Code 코드 탐색)
sudo apt install ripgrep  # Ubuntu/Debian
```

### Serena language server

`.serena/project.yml`에 등록된 언어별 설치 방법:

| 언어 | language server | 설치 |
|------|----------------|------|
| `python` | pyright | `pnpm add -g pyright` |
| `bash` | bash-language-server | `pnpm add -g bash-language-server` |
| `rust` | rust-analyzer | `rustup component add rust-analyzer` |
| `typescript` (JS 포함) | typescript-language-server | `pnpm add -g typescript-language-server typescript` |
| `toml` | taplo | `cargo install taplo-cli` |
| `yaml` | yaml-language-server | `pnpm add -g yaml-language-server` |
| `markdown` | marksman | 자동 다운로드 (설치 불필요) |

이 프로젝트에서 실제로 사용하는 언어만 설치하면 된다. 나머지는 `project.yml`의 `languages`에서 제거해도 무방하다.

### 선택

```bash
# agent-deck (프리셋 전환 TUI)
# https://github.com/asheshgoplani/agent-deck 참고
```

## agent-deck Profiles 연동

### 마켓플레이스 공유 범위

이 저장소를 마켓플레이스로 다른 프로젝트에 추가하면 `plugin/`(훅, 스킬, MCP 설정)만 전달된다.  
`.claude/settings.json`(`extraKnownMarketplaces`, `enabledPlugins`)은 각 환경에서 별도 구성이 필요하다.

### 프로필 목록

| 프리셋 | config_dir | 추가 플러그인 |
|--------|-----------|------------|
| solo (기본) | `~/.claude` | — |
| minimal | `~/.claude/$(whoami)_settings/plugin/deploy/.generated/claude-minimal` | (superpowers도 비활성) |
| tdd | `~/.claude/$(whoami)_settings/plugin/deploy/.generated/claude-tdd` | tdd-guard |
| collab | `~/.claude/$(whoami)_settings/plugin/deploy/.generated/claude-collab` | chorus |
| full | `~/.claude/$(whoami)_settings/plugin/deploy/.generated/claude-full` | agent-deck, codex |

### 프리셋별 워크플로우

**solo** (기본 개인 개발)
```
기능 설명 → /brainstorm → /plan → [승인] → 구현
```

**minimal** (토큰 절약)
```
기능 설명 → 바로 구현
(middlek 훅/Serena는 작동, superpowers 스킬 없음)
```

**tdd** (TDD 강제)
```
/setup  ← 프로젝트 최초 1회 (테스트 프레임워크 설정)
기능 설명 → /brainstorm → /plan → [승인] → 구현
(파일 저장마다 tdd-guard 훅이 자동으로 TDD 준수 검증, 위반 시 차단)
```

**collab** (AI-DLC 협업)
```
# PM 역할
chorus_checkin() → /idea → /proposal → [Admin 승인 대기]

# Dev 역할
chorus_checkin() → /develop → [태스크 작업] → chorus_submit_for_verify

# Admin 역할
chorus_checkin() → /review → [제안·태스크 승인/거부]
```

**full** (로컬 풀스택 + Codex 검토)
```
기능 설명 → /brainstorm
→ /codex:adversarial-review  ← 설계 검토 (선택)
→ /plan → [승인] → 구현
→ /codex:review              ← 구현 품질 검토 (선택)
→ /codex:status + /codex:result
```
