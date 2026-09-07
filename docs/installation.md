# Installation, global integration, and rollback

The installer is per-user and idempotent. It uses the existing Node executable; source modules are copied to a stable helper directory. No npm install, administrator privileges, signed-App mutation, or project modifications are required.

## Files outside the repository

| Location | Ownership / purpose |
| --- | --- |
| `%LOCALAPPDATA%\CodexFuelGuard\app\src\*.mjs` | Installed helper modules |
| `%LOCALAPPDATA%\CodexFuelGuard\app\hook.ps1` | Fixed-path Windows stdin bridge |
| `%LOCALAPPDATA%\CodexFuelGuard\bin\fuel-guard.cmd` | CLI launcher |
| `%LOCALAPPDATA%\CodexFuelGuard\state.json` | Persistent quota and per-session threshold acknowledgments |
| `%LOCALAPPDATA%\CodexFuelGuard\ipc-token` | Local IPC token, not a Codex credential |
| `%LOCALAPPDATA%\CodexFuelGuard\hook-health.json` | Latest event ID/cwd/time/success, no tool contents |
| `%LOCALAPPDATA%\CodexFuelGuard\synthetic.json` | Explicit bounded test warning, not real telemetry |
| `%LOCALAPPDATA%\CodexFuelGuard\install-manifest.json` | Ownership, original shared-file bytes, rollback metadata |
| `%LOCALAPPDATA%\CodexFuelGuard\backups\*` | Timestamped shared-file backups |
| `%LOCALAPPDATA%\CodexFuelGuard\config.json` | Optional user-owned configuration; preserved |
| `%USERPROFILE%\.codex\AGENTS.md` | Only CODEX-FUEL-GUARD managed section added/updated |
| `%USERPROFILE%\.codex\hooks.json` | Two owned handlers merged into existing arrays |
| User Startup folder `CodexFuelGuard.vbs` | Starts Node helper hidden at login |
| HKCU user environment `Path` | Only helper bin directory appended if absent |

With a configured `CODEX_HOME`, its instruction/hook files are used instead of the default. One installation corresponds to one Codex home/account context. Multiple independent Codex homes are not an account-switching feature.

The user trusts Fuel Guard in Codex's hook UI. Codex then writes its own exact-hash trust records in `%USERPROFILE%\.codex\config.toml`. Fuel Guard does not edit that file. These records remain inert after removal of the corresponding hooks.

## Preservation

Existing AGENTS.md bytes, including BOM/line endings, are retained around the managed section. Existing hook handler data is preserved; JSON whitespace may be reformatted. Initial backups and the manifest retain original bytes. Reinstallation updates the same managed block and handlers without duplicating them. Existing user PATH entries remain in order.

On installation failure, shared files, copied helper files, launcher, and changed PATH are rolled back where they were modified. The uninstaller first validates edited shared files, then removes only owned entries. With no intervening user edits, the original instructions and hooks are restored byte-for-byte. With later edits, only the managed section and exact owned command handlers are removed.

Backups and user-added files are never recursively deleted. No source repository is searched or edited as part of installation. The machine's preexisting global AGENTS.md was empty and hooks.json was absent on the first installation; the test suite separately exercises nonempty existing instructions/hooks.

## Recovery

Run `fuel-guard uninstall` or the repository's `uninstall.ps1`. It stops only the Fuel Guard daemon and the quota reader it owns. It does not terminate native Codex App or any other app-server.

If a shared file is malformed, uninstall fails before changing it. Compare that file with the corresponding timestamped backup, repair its syntax while preserving later edits, then repeat uninstall. Restoring an entire backup is appropriate only after reviewing subsequent changes. Retained backups and config support reinstallation from a known-good checkout.

The Startup VBS relies on Windows Script Host. If disabled by machine policy, `attach` remains the on-demand startup path. A new terminal/App process may be required to inherit an updated PATH, which is why global instructions use the absolute launcher. After updating Node or relocating its executable, rerun the installer. A changed hook command must be trusted again.
