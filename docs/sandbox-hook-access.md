# Restricted tool access and hook registration

## Confirmed on October 5, 2026

The restricted tool shell received `connect EACCES 127.0.0.1:44976`. Approved execution outside that sandbox authenticated and attached successfully to healthy daemon PID 29736. Both shells reported the same Windows username; their connection permissions differed. The trusted hook successfully delivered a weekly warning and recorded successful PostToolUse calls. This was neither an absent daemon nor a token/cwd conflict. The particular Codex or Windows policy change causing the restriction was not identified.

## Client fix

Hooks now write per-ID receipts under the canonical installation's `hook-receipts` directory, alongside the existing last-hook diagnostic file. Receipts contain only identity, cwd, installation, completion timestamp, event, success/error, and whether warning output was returned. They contain no prompt, tool output, token, or quota data.

When direct attach gets EACCES/EPERM specifically from a socket connect, the client may confirm a **recent hook connection** for the same explicit ID and installation. The receipt must be successful, from PostToolUse/UserPromptSubmit, and at most 90 seconds old with no future timestamp. No directory-derived ID or parent/worker substitution is attempted. Different IDs have separate receipts; a recorded failure replaces prior success. Malformed, inaccessible, stale, or missing receipts cannot establish protection.

Fallback output says `verification: recent-hook-receipt`, `registeredByThisCommand: false`, `directConnection: sandbox-access-denied`, and `quotaHealth: unknown`. It is historical evidence that the existing hook already registered this ID, not a live quota probe or promise of future delivery. The client never starts another daemon on denied access. Authentication, connection refusal, installation errors, filesystem access failures, and explicit steering attachment are not masked. Without eligible evidence it reports SANDBOX_ACCESS_DENIED and tells the user protection is unverified.

Doctor reports `currentSessionHook` separately from direct daemon reachability. Raw `status`, `check`, and other IPC operations still require connection permission; no sandbox bypass or elevation is automatic. If a hook has not run yet, the first attach may remain unverified until a normal prompt/tool boundary occurs. Do not start a new model turn just to create a receipt. If workers expose only a shared parent ID, the existing shared-identity limitation still applies. Receipts are per-user diagnostic evidence, not protection against another local process with write access.

## Validation and installation

45 automated tests pass, including recent exact-ID acceptance, missing/stale/future/failed/malformed evidence, wrong identities/installations, unsupported events, rejection of global-only evidence, unmasked authentication/filesystem/connection errors, steering exclusion, and the real PowerShell hook bridge writing a per-agent receipt. The sandbox blocks mock loopback servers too; the full suite passed with approved execution outside it.

`scripts/update-hook-access.mjs` updated only lifecycle.mjs and cli.mjs in the verified shared installation, dependency first. It backed up both files and checked protected integration bytes. No daemon restart, installation migration, trust edit, or startup change occurred. The daemon remained PID 29736, ready and fresh.

Live restricted attach succeeded using a four-second-old receipt for this task's exact ID while doctor still correctly reported direct EACCES. A separately approved synthetic event then reached this same active task through PostToolUse, without starting a model turn or burning quota to cross a threshold.

## Rollback

Restore lifecycle.mjs and cli.mjs from `C:\AI\Projects\.codex-fuel-guard-rober\backups\hook-access-1791257152616` to that installation's `app\src` directory. No daemon restart is required for this client-only rollback. Keep startup, hook commands, configuration, and tokens unchanged. Receipt files are inert diagnostics and, like other unknown retained files, may remain after uninstall; they are no longer accepted after 90 seconds.
