# Environment repair checkpoint — 2026-09-09 UTC

**Windows migration deployed; hook repair and reboot acceptance remain open.** The earlier completion claim proved delivery inside the build environment, not a Windows-started daemon reachable across execution environments. See the live migration update below for current state.

## Confirmed cause

Read-only diagnostics from three contexts established different backing files for the same displayed AppData path:

| Context | Identity | ipc-token file ID suffix | SHA-256 prefix |
| --- | --- | --- | --- |
| Codex task | CodexSandboxOffline / SID ending 1004 | 001c0000000c9bbb | DEB8E6A7 |
| Elevated Codex tool | rober / SID ending 1001 | 001c0000000c9bbb | DEB8E6A7 |
| Actual ordinary PowerShell, run by user | rober / SID ending 1001 | 00120000000c925b | A41FD614 |

The launcher and installed cli.mjs also had different file identities despite identical bytes. config.json had matching identity and contents. Thus this is selective filesystem visibility, not merely environment-variable expansion or user permissions. The underlying Windows/Codex virtualization mechanism has not been identified; do not claim a particular implementation.

At inspection, the real Windows-owned Node daemon was PID 19892 listening on 127.0.0.1:44976. Both Codex tool contexts received HTTP 403 using their token. Its owner and exact Fuel Guard command line were verified read-only. There was one Fuel Guard Startup VBS entry, no matching scheduled task/Run-key duplicate. Unrelated entries/processes were preserved. PIDs are historical, never reuse without checking ownership.

The old client collapsed HTTP 403 into “Invalid daemon reply”, and start swallowed it and attempted another process, yielding the misleading “daemon did not start”/EADDRINUSE behavior. Clients also attempted token creation, and executable startup assumed PATH. Those are confirmed code defects independent of the filesystem boundary.

## Repository hardening (now deployed by Windows migration)

- Classify authentication mismatch, occupied/unrecognized port, missing/inaccessible token, connection refusal, and timeout. Only confirmed refusal permits a host-side spawn. Do not start/install/uninstall from a Codex task identity.
- Clients only read tokens. Only installation/daemon ownership creates one. Installed modules resolve their own root instead of trusting task environment variables.
- Preserve valid explicit codexPath; if removed by an App update, discover App-managed binaries, then executable PATH candidates. Config and CODEX_CLI_PATH are unchanged.
- Return quota-reader health separately from daemon reachability. Keep startup stderr in a local startup.log. Human-facing hook health notices do not start inference turns. A local unauthenticated /health diagnostic exposes service/PID/root/owner/token fingerprint, never token contents or quota/session contents.
- Added regression tests; 35 pass at the latest checkpoint. Existing threshold tests remain intact.

These improvements alone do **not** make two distinct AppData views the same installation. Do not deploy back into that path and claim resolution.

## Migration plan and acceptance criteria

1. Prove a stable shared installation root before migration. Candidate: `C:\AI\Projects\.codex-fuel-guard-rober`, within an explicitly shared workspace root but separate from project source. Run scripts/probe-shared-root.ps1 from ordinary Windows, then with `-Label task` from two Codex tasks; compare file IDs and full fingerprints. Do not place IPC secrets in a Git repository.
2. Implement and test a transactional **migration**, not a second installation: preserve the Windows configuration, token and threshold state; update the existing Startup entry to the shared installation; retain original AppData files as rollback only; provide an old-launcher compatibility shim if needed. Preserve exact trusted hook command definitions by updating their Windows-side bridge to the canonical shared runtime, or request trust only if a definition must change. Update only the managed global instruction block. Inspect/stop only the confirmed old Windows daemon after the replacement package passes tests; no blind PID killing.
3. Execute migration from actual ordinary Windows. Elevated Codex shell was proven insufficient to validate backing-file identity. The user must run the reviewed Windows migration command, or a separately proven host execution path must be established.
4. Compare /health root, owner, in-memory token fingerprint and process ID with on-disk values in ordinary Windows and multiple Codex tasks. Attach exact IDs, synthetic warning receipts, no extra inference turns; confirm quiet healthy hooks and visible failures. No unrelated project operations.
5. Coordinate reboot with user only after pre-reboot checks pass. After reboot, verify the same canonical installation/identity, one startup/listener, fresh quota, two task registrations and synthetic receipt without manual daemon startup. **Do not claim reboot reliability before this.**

## Historical pre-migration state

No live daemon, startup entry, hook definition/trust, global instruction, installed configuration, or project source outside this repository was changed during this investigation. The initial required attach attempt ran the old client's failing start behavior; no second persistent daemon was found. The user's working Windows installation remains as it was. Repository changes can be reverted without affecting it. Ignored .local diagnostics contain fingerprints, not IPC token contents. The newly prepared shared-root probe is not a migration and does not install/start anything.

## Live migration update

The candidate root was proved shared between ordinary Windows and this task: marker file ID `0x0000000000000000000e0000000f6a3f`, SHA-256 `115E679C47A1279F0CB26B7452A416FD98D1D62E43AC925CB2C34ADE5EE3DB4C`.

The first migration rolled back after ECONNRESET: the new path-derived port 48010 belonged to an unrelated listener. That process was preserved. Migration now records endpoint.json and reuses the old guard's port only after authenticated shutdown and command-line ownership verification. The ordinary Windows retry succeeded with PID 18564, health ready, at `C:\AI\Projects\.codex-fuel-guard-rober`. This task authenticated and attached its actual CODEX_THREAD_ID to that same PID/root; fresh real five-hour and weekly data were returned. No model turn was started by these operations.

However, the legacy AppData hook bridge remains different in the Codex view. No synthetic receipt was observed after queueing a warning. Therefore working IPC is proved; automatic warning delivery is still unresolved. A prepared `scripts/repair-hook-path.mjs` moves the two owned definitions to the canonical bridge, preserves config.toml/trust records, and requires explicit review/trust of the new paths. Do not claim the old trust-preserving bridge worked. User agreement is pending at this checkpoint.

35 automated tests pass, including migration endpoint validation, explicit canonical hook replacement/idempotence, unchanged trust configuration, auth mismatch, sandbox spawn refusal, discovery fallback, and original quota/lifecycle coverage. An incidental Windows-reserved test port was fixed by letting the OS allocate the mock HTTP port.

### Files changed outside this repository

The user-run migration created the shared installation (app, bin, token, state, config, endpoint.json, manifest, backups, migration journal), replaced the existing Fuel Guard Startup VBS target, updated only the managed global AGENTS.md section, redirected the ordinary Windows legacy launcher/bridge, and updated the user PATH. Codex config.toml bytes were checked unchanged. Original AppData files remain as rollback material. No signed executables, CODEX_CLI_PATH, unrelated startup entries, or project source were changed. This supersedes the earlier pre-migration current-state paragraph above.

### Uninstall and rollback

Run in ordinary Windows: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\rober\OneDrive\Documents\ChatGPT\Codex Fuel Guard\uninstall.ps1"`. It selects the canonical manifest, stops the authenticated daemon, removes managed integration, and retains backups/config/unknown files. Legacy AppData rollback files and compatibility launcher may remain inert; do not start the legacy installation alongside the canonical one.

For rollback instead of uninstall: first stop the canonical daemon using its absolute launcher. Inspect `migration-rollback.json` locally (do not publish it), restore each recorded shared file from its base64 snapshot and restore its saved user PATH, then start the old AppData launcher. Do not restore snapshots blindly over later user edits; merge unrelated changes. The migration catch performs this restoration automatically on deployment failure. The journal includes startup, global instructions/hooks, and legacy bridge/launcher snapshots. Never run old and canonical startup concurrently.

### Remaining acceptance

After canonical hook repair/trust, queue a fresh synthetic event for the actual task ID and observe developer-context receipt plus canonical hook-health.json. Repeat attach and receipt in another existing Codex task/project. Only then coordinate a user reboot. After reboot run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\rober\OneDrive\Documents\ChatGPT\Codex Fuel Guard\scripts\verify-reboot.ps1"` in ordinary Windows before any manual start. It records boot/process times and status without repairing startup. Verify one listener/startup entry, fresh quota, and receipt in two tasks. Reboot reliability remains unproven until those checks pass.
