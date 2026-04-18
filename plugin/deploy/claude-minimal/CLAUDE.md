# Agent 실행 원칙

`Agent()` 호출은 항상 `run_in_background: true`. 완료 알림 후 결과 처리.

# 핵심 원칙

- 코드 탐색은 `find_symbol`, `get_symbols_overview` 등 Serena 심볼 툴 우선 사용
- 중요 작업 완료 후 새로 파악한 아키텍처/컨벤션은 `write_memory`로 업데이트

# 코드 리뷰

Codex를 적극 활용한다.

흐름: `/codex:adversarial-review` → `/codex:status` → `/codex:result` / 문제 발생 시 `/codex:rescue`