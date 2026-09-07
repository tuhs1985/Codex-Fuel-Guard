# Test and live validation record

Date: **2026-09-07**, Windows 11 x64 build 26200, Node 24.17.0, installed Codex CLI 0.153.4, native App 26.901.6511.0.

## Automated validation

Run `node --test test/*.test.mjs` from the repository. The suite covers:

Final suite: **27 tests passed, zero failed**, including the Windows bridge under an altered environment and UTF-8 BOM input. Final live telemetry exposed one-second reset timestamp jitter; a regression test verifies fresh readings remain available across that jitter without rearming thresholds.

- A sanitized real installed-build response, authoritative multi-bucket map, independent weekly/5-hour identification, missing data, malformed percentages, and unknown durations.
- 20/10/5 transitions, initial-low catch-up, steep-drop coalescing, duplicate readings, out-of-order receipt times, prior reset epochs, hysteresis, reset/rearm, recovery invalidation, stale/expired warnings, sparse notifications, and account changes.
- Persisted threshold and per-session delivery state across actual daemon process restart; multiple projects; idle deferral; invalid session identity; duplicate daemon bind; token-required loopback IPC; failure to launch Codex.
- JSON-lines RPC against a fake app-server, server approval request rejection, disconnect errors, and loopback endpoint validation.
- Fake WebSocket app-server: loaded-thread pagination, targeted steering, expected-turn mismatch, idle deferral, reconnect, other-session isolation, and zero turn/start calls.
- Installer idempotence, preservation of existing BOM/CRLF instructions and existing hook handlers, exact uninstall restoration, later user edits, invalid shared-file preflight, failed installation, and rollback of partially copied upgrade modules.

No automated test calls a hosted model. Temporary test installations explicitly disable user PATH integration and use temporary Codex/startup directories. Live CLI steering acceptance is not claimed; its wire behavior is validated against the generated schema and fake transport.

## Live sequence and results

1. Generated the installed app-server schema before writing implementation. Read-only initialization reported Codex Desktop/0.153.4 on Windows. Real `account/rateLimits/read` returned 12% used in the 300-minute window and 80% used in the 10,080-minute window at the first probe. The sanitized result is `test/fixtures/real-0.153.4.json`. No authentication file was opened.
2. The separate quota reader returned `thread/loaded/list: []`. Process arguments confirmed native App owns a private stdio app-server. The unsupported Unix daemon command was tested and rejected on Windows. No App executable, private pipe, or CODEX_CLI_PATH was changed.
3. Installed the helper globally. Live `hooks/list` discovered the two handlers enabled and untrusted. The user reviewed and trusted them in App Settings. A second discovery verified both as trusted, with no discovery errors.
4. The first isolated hook test completed one turn but returned `MISSING`. It exposed a Windows environment difference in the hook process. The helper was fixed to pin FUEL_GUARD_HOME and accept a possible stdin BOM; diagnostics were added. The failure is recorded here rather than omitted.
5. Repeating the bounded isolated test on thread `01a07a66-67b7-77f1-b99b-4c9a6b16696f` succeeded at **05:45:26 UTC**. `thread/loaded/list` found the intended test thread. The UserPromptSubmit completion event contained a developer-context synthetic warning. The model replied **FUEL_GUARD_RECEIVED**. Exactly **one turn/start request and one turn/started notification** occurred in this successful check. No warning-triggered additional turn or continuation occurred. The first failed check also used one turn, so two short explicit validation turns were used in total.
6. The existing native App task `01a07a53-c850-7c02-96a0-da0bc4bd62e4` then received the real weekly advisory through an ordinary hook boundary. A synthetic test queued only for this same active task was received as developer context at **05:45:43 UTC**. The agent observed the actual `[FUEL GUARD] SYNTHETIC DELIVERY TEST` message. `synthetic.json` recorded delivery to that exact ID. This native App test created **zero new turns** and did not alter the actual quota state.
7. Subsequent ordinary tool calls produced no repeated warning. The daemon continued local quota reads. No deliberate quota-burning workload, reset-credit redemption, automatic model switch, or interruption was performed.
8. Final live verification at **05:57:48 UTC**, after the reset-jitter fix, showed fresh, available windows at **16% five-hour** and **9% weekly** remaining. The native App agent received the real five-hour advisory and weekly completion-priority warning automatically. This directly exercised weekly binding and different warning severities during the ongoing build.

Quota percentages changed while this substantial build was running; those changes are not attributed to polling. The two explicit test turns were validation inference; all ordinary monitoring calls used account telemetry only.

## Scope isolation

The installer only writes the manifest-listed user installation, global instruction/hook files, Startup launcher, and user PATH. No project source edits are part of integration. The unrelated `C:\Project\Conan Board Game Foundry Edition` directory was not registered by the synthetic test, and no message/turn was sent there. The daemon's test routing verified an unrelated session cannot consume the synthetic event. Global hooks are available there as intended and can supply real account-wide warnings at its own normal boundaries.

That unrelated directory is not a Git repository, so a clean Git comparison was not available there. A before/after recursive file-name/size/mtime inventory during final installation verification covered **5,346 files with zero metadata changes**. Repeated installation and execution of the hidden Startup launcher kept the same daemon PID, exactly one user PATH entry, and an unchanged hash of Codex config.toml. Fuel Guard itself has no project-write path.

## What this proves and does not prove

Proven: real quota → local persisted threshold logic → model-visible native App context, correct task targeting, no monitoring inference/new turn, and global installed availability with user trust. The live test also verifies real Codex hook execution and model acknowledgment in an isolated app-server session.

Not proven: uninterrupted delivery while the model performs no supported tool calls, crash-perfect exactly-once context consumption, interactive real CLI steering, or Windows login startup after an actual reboot. These remain explicit limits. The hidden Startup launcher and installed CLI are exercised without reboot during installation verification.

Checked-in evidence under `docs/evidence/` contains the successful isolated hook receipt and the final installation isolation result. The synthetic native App receipt was observed directly as developer context in this task; its local delivery record was copied separately. Final installation uses the same source modules as the repository. Only the active native App task remains registered after removing temporary probe registrations.
