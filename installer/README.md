# installer/ — Sasist Agent release entrypoint

**Single official path (Stage 5):**

```text
installer\build.ps1
  → sasist-agent\scripts\publish-release.ps1
  → Output\SasistAgentSetup.exe
```

Do **not** compile `installer.iss` here — it is a hard-fail stub.

Legacy Python installer scripts (`install.ps1`) are unused leftovers; the live Inno script is
`sasist-agent\installer\SasistAgent.iss`.
