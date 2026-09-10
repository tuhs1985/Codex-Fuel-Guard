# Troubleshooting

Run the absolute launcher when PATH has not refreshed:

```powershell
& "$env:LOCALAPPDATA\CodexFuelGuard\bin\fuel-guard.cmd" doctor
```

| Symptom | Action |
| --- | --- |
| Daemon unavailable | Run `start`. If it fails, run `daemon` in a terminal for the error. Check Node, the data directory, and a loopback port collision. |
| Quota stale/unavailable | Confirm installed Codex works and is signed in. Check network and `doctor`. An optional config.json codexPath can identify the correct executable. Do not copy credentials into Fuel Guard. |
| Hooks untrusted or modified | Review the two Fuel Guard handlers in App Settings → Hooks or CLI `/hooks`. Trust the current definition. |
| Hooks trusted but no warning | Check hookHealth. Normal checks are intentionally silent. Verify the right session is attached, a threshold is pending, and a supported tool/prompt boundary occurred. Existing tasks can take a boundary/config refresh to apply new hooks. |
| Hook health failure | Check the fixed FUEL_GUARD_HOME in app/hook.ps1 and that its Node executable exists. The first live test exposed an environment mismatch; the pinned path is required. |
| Explicit thread required | Run `attach` inside Codex where CODEX_THREAD_ID is available, or provide `--thread` and `--cwd`. Never substitute an unrelated task just because it has the same directory. |
| CLI endpoint attach rejected | Verify the supplied ws://127.0.0.1:PORT server actually owns that loaded thread and its cwd matches. A standalone native App task is not in another server's loaded list. |
| Steering remains deferred | The task may be idle, in review/compaction, disconnected, or not expose a newest in-progress turn. No forced resume/turn start is attempted. |
| Corrupt threshold state | Stop Fuel Guard, preserve state.json for review, then repair or move it explicitly. Reinitializing state can produce one catch-up warning and loses acknowledgment history. |
| Missing 5-hour window | The backend did not return a valid 300-minute window. Weekly tracking still works. Missing is not zero. |
| Another session has a warning | Quota is account-wide; each attached session receives its own threshold guidance. Synthetic warnings use one exact ID only. |

`check` explicitly retrieves pending warnings for an attached session as a manual fallback. Do not create a model-driven polling loop around it. Use `status` for a local percentage display. `test-warning --thread ID` is an opt-in two-minute synthetic delivery check, never an automatic recurring action.

Hook health is a last-event record, not an inference receipt. The live validation includes model acknowledgment and native developer-context receipt separately. Guard errors should be reported once at substantive-session startup; they should never repeatedly interrupt the task.
# Cross-directory registration

If a worker reports “Thread already registered with another cwd”, see [registration identity repair](registration-identity.md). The corrected runtime allows hook-mode attachment across directories without replacing session identity or clearing warning acknowledgements. The documented runtime-only update preserves startup and trusted hook commands. A distinct hook agent ID receives independent warnings; hooks that expose only a shared parent ID cannot promise separate parent/worker delivery.
