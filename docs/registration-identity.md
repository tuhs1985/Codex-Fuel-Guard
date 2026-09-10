# Registration identity repair

## Evidence and cause

The reported failure was found in **Discord Assistant Worker**, task `01a0419c-f3ed-7a90-98de-708331d827da`, turn `01a0882e-764c-7bc3-8147-3f6a8affaa65`. Its recorded task cwd and existing Fuel Guard registration were the Codex `.chatgpt-projects` directory. The failing shell command ran the canonical `fuel-guard.cmd attach` with no explicit thread override, from `C:\AI\Projects\Discord-AI-GM-Helper`.

The CLI uses CODEX_THREAD_ID and process.cwd(). The old core rejected any second cwd for the same ID, including a task legitimately executing tools in its project directory. That is sufficient to explain this failure. The failing command did not print its environment, so parent-ID inheritance is **not established**. The worker title alone does not prove subagent execution. No unrelated project source or operational problem was investigated or modified.

Installed Codex still reports version 0.153.4. Its app-server schema describes thread/endpoint steering, not shell-environment inheritance. [Official hook documentation](https://learn.chatgpt.com/docs/hooks#common-input-fields) identifies session_id as the current session (parent for subagent hooks), and cwd as session metadata. agent_id is documented for subagent lifecycle events, not guaranteed for every PostToolUse event. Fuel Guard therefore must not assume every worker tool hook carries a distinct agent ID.

## Behavior

- Hook-mode registrations use explicit IDs, never directories, as routing keys. Repeated attach in another directory retains the original cwd, records lastCwd, and preserves acknowledgements. It neither emits nor consumes a warning.
- Attach reports deliveryIdentity=hook-payload and sharedDirectory when its cwd differs from the original registration. Shell registration does not prove which agent will receive a future hook.
- Hook input chooses a valid explicit agent_id when provided, otherwise the explicit session_id. It never consults CODEX_THREAD_ID to override hook input. Invalid provided agent IDs fail rather than falling back to the parent.
- Each hook identity is bound to its supplied sessionId on first observation. Reuse under another session is rejected before acknowledgement or synthetic delivery. Older persisted records acquire this binding at the next hook; existing delivery state survives.
- A separate worker ID has separate acknowledgement state, even at the same cwd. Worker hooks cannot consume a synthetic warning addressed to the parent's ID. Unrelated session IDs never merge based on cwd.
- Steering retains verified endpoint/thread checks, normalized Windows cwd matching, loaded-thread checks, and expected active-turn preconditions. Registration cannot silently replace its endpoint or downgrade its delivery mode.

If Codex provides the exact same hook ID for parent and worker without an agent_id, Fuel Guard cannot distinguish them. They share deduplication, and the warning returns only to the actual invoking hook; independent delivery to both is not promised. No IDs are synthesized from paths, process ancestry, titles, or transcripts. IPC is authenticated per user, not a security boundary against a malicious local process holding the same token.

## Validation and deployment

40 automated tests pass. Coverage includes parent-first/worker-first shared IDs, changing directories, independent explicit worker IDs, unrelated same-directory sessions, cross-session rebinding rejection, invalid IDs, persistence, Windows path equivalence, endpoint/mode isolation, IPC synthetic targeting, and the actual PowerShell bridge's agent_id handling. Test quota-reader failure uses an explicit non-Codex executable, avoiding fallback to the real account.

Run `node scripts/update-registration.mjs` in ordinary Windows to update only core.mjs, cli.mjs, and daemon.mjs in the existing canonical installation. It authenticates and verifies the current daemon command, backs up modules, stops that daemon, copies the fix, and waits for fresh quota. It checks bytes of configuration, IPC token, endpoint, startup, global instructions, and trusted hook files. Failure restores the modules and restarts the prior runtime. No installer, trust reset, project edits, or monitoring-created model turns are involved.

Rollback: from ordinary Windows stop the canonical guard, restore those three module files from the backup directory printed by the updater into app/src, then run the canonical launcher with start. Keep state/configuration and all integration files. Legacy code ignores the new observation fields, but reinstates its cwd restriction.

The user ran the updater from ordinary Windows successfully. It reported healthy PID 2276, integrationUnchanged=true, and backup `C:\AI\Projects\.codex-fuel-guard-rober\backups\registration-1789011637920`. All three installed module hashes matched the tested repository files.

Live validation ran this task's canonical attach from `C:\AI\Projects`, using its real inherited CODEX_THREAD_ID without an override. It succeeded with sharedDirectory=true. A synthetic warning addressed to that exact ID then arrived as developer context at the existing PostToolUse boundary. hook-health.json recorded the matching id/sessionId, original task cwd, ok=true, and warningReturned=true. Other registered sessions retained their original IDs/directories and were not targeted. No model turn was created, and Discord Assistant Worker was not woken; its exact historical environment inheritance remains unobserved.
