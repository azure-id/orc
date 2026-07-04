# Push checklist (avoid the OneDrive broken-commit problem)

The `orc@` with no version + `TAR_ENTRY_ERROR` on install means files were
missing from the pushed repo. Root cause: committing from inside a cloud-synced
folder (OneDrive/iCloud) corrupts the commit. Follow this every time.

## One-time: build the repo OUTSIDE any synced folder
- Use e.g. `C:\dev\orc-pkg` (Windows) or `~/code/orc-pkg` (Mac).
- NOT under OneDrive, Documents, Desktop, Pictures, or iCloud Drive.

## Before every push
```
# from the repo root
npm run verify          # must print: ✅ ORC package OK — ...
git add -A
git status              # confirm bin/cli.js AND templates/** are staged
git commit -m "..."
git push --force        # (first corrected push only; normal push after)
```

## After push — verify on GitHub in the browser
- Open the repo, click into `bin/` → confirm `cli.js` is present and non-empty.
- Click into `templates/agents/` → confirm ~13 files.
If the browser shows them, installs will work.

## Consumer install sanity
```
npm i -g github:azure-id/orc
npm ls -g orc           # MUST show orc@0.1.0 (with the version!)
orc where               # prints paths, no crash
```
`orc@` with no version = still broken; the push was incomplete.
