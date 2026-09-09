# Codex Fuel Guard

**Environment repair in progress:** the September 9 investigation confirmed different backing token and hook files at identical AppData paths in ordinary Windows versus Codex tool contexts. The Windows installation has migrated to `C:\AI\Projects\.codex-fuel-guard-rober`; authenticated access and automatic real/synthetic hook delivery work against the Windows-started daemon. The user also confirmed successful delivery in a second task. Reboot acceptance remains open; see [confirmed cause and migration/reboot checklist](docs/environment-repair.md).

A Windows-first, per-user quota watchdog for Codex. One local Node.js daemon reads real account limits through the installed `codex app-server`; trusted global hooks deliver compact warnings inside existing work. Normal monitoring uses **no model inference**.

The IOC was tested with Windows 11 x64, Node **24.17.0**, Codex CLI **0.153.4**, and native Codex App **26.901.6511.0**. A synthetic warning reached the running native App agent through `PostToolUse` developer context. See [validation](docs/validation.md).

## Install

Requires Windows PowerShell, Node.js 22 or later, and an installed, signed-in Codex executable. Discovery checks a valid configured path, App-managed binaries, then PATH. Run installation/startup from ordinary Windows. No npm dependencies, API key, or administrator account is required. For this migrated machine, use the canonical paths in the environment repair notes; the legacy AppData examples below describe the original installation.

```powershell
node --test test/*.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Review and trust the two **Codex Fuel Guard** hooks in **Codex App Settings → Hooks**, or CLI `/hooks`. Trust is tied to the hook definition; Codex requires review again if that definition changes. The installer does not bypass trust or grant permissions.

Open a new terminal for the updated user PATH, or use the absolute launcher immediately:

```powershell
& "$env:LOCALAPPDATA\CodexFuelGuard\bin\fuel-guard.cmd" doctor
& "$env:LOCALAPPDATA\CodexFuelGuard\bin\fuel-guard.cmd" attach
```

Inside Codex, `attach` takes `CODEX_THREAD_ID` from the session. Outside Codex, supply an explicit `--thread ID --cwd PATH`. Directory guessing is intentionally disabled.

## Global behavior

Installation adds a short, idempotent managed section to `%USERPROFILE%\.codex\AGENTS.md` (or the selected `CODEX_HOME`) telling substantive sessions to run the absolute `attach` command. Existing instructions are preserved. Project instructions remain free to add detail.

Two entries are merged into global `hooks.json`: `PostToolUse` and `UserPromptSubmit`. A hook identifies its session from Codex's input, registers it, and returns pending warnings as `additionalContext`. Empty checks produce no output and make no hosted request. Idle sessions receive their warning on their next ordinary prompt/tool boundary; the guard does not wake them.

The per-user Startup folder launches the helper hidden at login. `start` and `attach` are idempotent; a loopback listener enforces a single daemon for the installation. The hook fast path never starts a daemon. If startup is disabled or the daemon crashes, the next substantive session's `attach` restores it. Guard failure does not block work.

## Warning policy

| Remaining | Guidance |
| --- | --- |
| 20% | Continue current work; avoid scope expansion. |
| 10% | Prioritize completion; avoid additional substantial work; prepare a checkpoint if uncertain. |
| 5% | Stop expanding scope; finish immediately completable work and create durable restart/handoff state. |

The same policy applies independently to 300-minute and 10,080-minute windows, across the account's returned quota buckets. Weekly limits can bind first. Missing windows are unavailable, never interpreted as zero.

Each threshold fires once per crossing. Recovery of at least three percentage points above a threshold for two successive samples rearms it. A later reset epoch rearms only after the previous reset time has passed. A steep drop coalesces crossed thresholds into the most urgent warning; sessions receive only the latest pending warning per window. Starting below a threshold produces one catch-up warning. State survives daemon restarts.

Copy `config.example.json` to `%LOCALAPPDATA%\CodexFuelGuard\config.json` to customize thresholds, hysteresis, and cadence. An optional `codexPath` selects an executable; it does not modify `CODEX_CLI_PATH`. Restart Fuel Guard after config changes.

## Commands

```powershell
fuel-guard start
fuel-guard status
fuel-guard attach                       # inside Codex
fuel-guard check                        # explicit fallback; not a monitoring loop
fuel-guard doctor
fuel-guard detach --thread THREAD_ID
fuel-guard stop
fuel-guard uninstall
```

`status` returns JSON with remaining percentages, reset Unix timestamps (seconds), freshness, and registered sessions. `doctor` adds actual Codex version, hook trust/enablement, discovery errors, and the most recent hook health record. See [troubleshooting](docs/troubleshooting.md).

## App-server-bound CLI

If using a deliberately exposed local CLI app-server:

```powershell
# Separate terminal: start your Codex server; keep the default approval policy.
codex app-server --listen ws://127.0.0.1:4500
# Another terminal: use that server for your interactive session.
codex --remote ws://127.0.0.1:4500
# Inside that session:
fuel-guard attach --endpoint ws://127.0.0.1:4500
```

Fuel Guard verifies the explicit thread is loaded and its cwd matches. It reads the current turn and sends only `turn/steer`, with `expectedTurnId`. Idle or incompatible turns retain their warning. A disconnected server is retried. Hooks can still provide a safe delivery opportunity; acknowledgments suppress duplicates.

The native App's stdio server is private to the App. A separate quota reader cannot see its loaded tasks. Fuel Guard does not patch, replace, intercept, or proxy App binaries. The CLI WebSocket transport is experimental, loopback-only, and appropriate only on a trusted local machine. Native App protection uses hooks.

## Limits and safety

This is warning infrastructure, not a guarantee against exhaustion. Native App warnings require a supported tool/prompt boundary. Long tool-free reasoning, long-running tools, disconnected telemetry, disabled/untrusted hooks, and unsupported tool paths can delay delivery. See [architecture and delivery semantics](docs/architecture.md).

Fuel Guard never redeems reset credits, changes models, interrupts turns, approves permissions, starts monitoring turns, reads authentication files, or exports telemetry. Codex itself uses its existing account authentication and network to read quota. Only quota fields, a hashed account identifier, and minimal local session/delivery state are retained.

## Uninstall and rollback

```powershell
fuel-guard uninstall
# Or from this repository:
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1
```

The uninstaller stops Fuel Guard, removes its launcher and user PATH entry, removes only its instruction section and hook handlers, and restores exact original shared bytes when there are no intervening edits. Later unrelated edits are preserved. Backups, user configuration, and unknown files remain under `%LOCALAPPDATA%\CodexFuelGuard`; no recursive deletion is performed. Codex's own trust records remain inert after hook removal.

For a damaged shared file, review backups before restoring it; blindly restoring an old whole file could erase subsequent changes. Re-run the installer from a known-good checkout to reinstall. See [installation and rollback details](docs/installation.md).

## Development

```powershell
node --test test/*.test.mjs
.\scripts\capture-protocol.ps1
```

All repeatable tests use fake servers or isolated temporary state. The optional `node scripts/live-hook-test.mjs --run` starts **one bounded inference turn** for supervised validation and is never invoked by the daemon or normal tests. [Protocol notes](docs/protocol.md) describe the captured schemas and upgrade procedure.
