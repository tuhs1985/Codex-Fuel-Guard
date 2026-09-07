# Verified protocol and research

## Installed build

Verified on 2026-09-07: `codex-cli 0.153.4`, Windows x64. Executable:
`C:\Users\rober\AppData\Local\OpenAI\Codex\bin\8e5b6932251c2c1c\codex.exe`.
Native App package observed: `OpenAI.Codex_26.901.6511.0_x64__2p2nqsd0c76g0`.
The App launches its signed app-server with stdio; no documented external WebSocket endpoint was present. `codex app-server daemon version` explicitly returned “daemon lifecycle is only supported on Unix platforms.”

The installed binary generated JSON schemas **before implementation** with:

```powershell
codex app-server generate-json-schema --experimental --out protocol/generated
```

The relevant unmodified schema files and SHA-256 manifest are checked in under `protocol/verified`. `scripts/capture-protocol.ps1` repeats this extraction. Upstream source is corroboration, not a substitute for the installed schema. Official source main inspected during research was `694b6319d3ad2399f6e435760a22d9b9357f0697`; it is not asserted to equal the installed binary's source commit.

| Interface | Verified shape / behavior | Evidence |
| --- | --- | --- |
| `initialize`, `initialized` | clientInfo + experimentalApi capability; then initialized notification | Live handshake and generated schema |
| `account/rateLimits/read` | legacy rateLimits and optional rateLimitsByLimitId; integer usedPercent; duration minutes; reset Unix seconds | Live account response, sanitized fixture |
| `account/rateLimits/updated` | sparse rateLimits notification, accountId optional | Installed schema + official README; event parser implemented |
| `thread/loaded/list` | data array of IDs, cursor pagination | Live empty separate reader; live test thread found; fake pagination |
| `thread/read` | explicit threadId; includeTurns false | Installed schema; endpoint identity path |
| `thread/turns/list` | descending limit 1 with itemsView notLoaded | Installed schema; adapter current-turn recovery |
| `turn/started`, `turn/completed` | threadId and turn object | Live test lifecycle |
| `turn/steer` | threadId, expectedTurnId, input text array | Installed schema + fake WebSocket success/idle-race test |
| `hooks/list` | cwds array; discovered handlers include trustStatus, enabled, currentHash, key | Live discovery before and after user trust |
| `hook/completed` | run summary with context entries | Live successful UserPromptSubmit receipt |
| Global hooks | hooks.json next to active user config; PostToolUse/UserPromptSubmit additionalContext | Installed discovery + live native App developer-context delivery |
| Global AGENTS.md | user-level all-project instruction layer | Existing path + official instructions documentation; managed block installed |

Schema existence does not imply native App endpoint access. No code attempts to access the App's private stdio transport. `codex queue`, Stop continuations, and App heartbeats were considered but not used: they can introduce additional work after an idle/finished turn, contrary to the guard's normal monitoring policy.

## Research sources and architectural choices

- [Official app-server documentation](https://learn.chatgpt.com/docs/app-server) and [official repository README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md): initialization, quota reads/events, loaded threads, steering preconditions, and experimental transport. The implementation distinguishes protocol availability from reachability.
- [Official hooks documentation](https://learn.chatgpt.com/docs/hooks) and [hook implementation](https://github.com/openai/codex/tree/main/codex-rs/hooks): global discovery, Windows commands, trust, tool coverage, and developer additional context. PostToolUse avoids a warning-triggered continuation.
- [Official AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md): global user instructions coexist with project instructions.
- [lucianlamp/codex-monitor](https://github.com/lucianlamp/codex-monitor): reviewed endpoint-scoped loaded-thread resolution, steering, acknowledgment, and Windows native App limitations. Reused the architectural distinction; did not copy code or adopt its App Stop/heartbeat receiver.
- [zhaotq26/CodexQuotaMonitor](https://github.com/zhaotq26/CodexQuotaMonitor): corroborated Windows stdio quota reads and unavailable-window handling without credentials or inference.
- [roboticsdao/codex-usage-monitor](https://github.com/roboticsdao/codex-usage-monitor): corroborated the privacy-oriented app-server quota-reader approach. Dashboard, history, and billing features were excluded.

No third-party project was cloned into the implementation. Downloaded research materials remain ignored local scratch files. Generated official schemas are protocol artifacts, not handwritten assumptions.

## Upgrade procedure

Record `codex --version`, regenerate schemas, review the manifest diff and required methods, rerun all tests, and run `doctor`. Recheck window semantics, turn status enum, hook input/output and trust behavior. Use the explicit supervised live hook check only after mock tests pass. If compatibility fails, stop the guard and keep Codex usable; do not monkey-patch the signed App or force `CODEX_CLI_PATH`. Reinstall from a reviewed commit when helper changes are needed. Changes to the hook definition require renewed user trust.
