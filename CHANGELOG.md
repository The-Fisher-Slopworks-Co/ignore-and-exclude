# Changelog

All notable changes to the **Ignore & Exclude** extension are documented here.

## [0.3.0] - 2026-08-07

### Added

- **Sidebar panel**
  ([#5](https://github.com/The-Fisher-Slopworks-Co/ignore-and-exclude/issues/5)):
  an **Ignore & Exclude** view in the Explorer that lists every entry of
  `.gitignore` and `.git/info/exclude` — including hand-written ones — grouped
  per file, and per folder in multi-root workspaces.
- Checkbox per entry to disable and re-enable it without deleting: a disabled
  entry stays in the file, commented out with the `#off ` marker, and is
  restored verbatim when re-checked.
- Inline actions to remove an entry or open the ignore file (entries jump to
  their own line), a refresh button, and automatic refresh when either file
  changes on disk.
- Adding a path whose pattern is present but disabled now re-enables the
  existing line instead of appending a duplicate.

## [0.2.0] - 2026-06-15

### Added

- Folder support: both commands now work on folders selected in the Explorer,
  not just files.

## [0.1.0] - 2026-06-10

### Added

- **Add to .gitignore** and **Add to .git/info/exclude** commands in the
  Explorer context menu and the editor-tab context menu.
- Root-anchored, exactly-matching patterns (leading `/`) so only the chosen file
  is ignored, with gitignore glob metacharacters (`*`, `?`, `[`, `\`) and
  trailing spaces escaped.
- Idempotent writes: a file already present is skipped instead of duplicated,
  and missing files / trailing newlines are handled cleanly.
- Multi-select support — add every selected file in one action.
- Correct `.git/info/exclude` resolution when `.git` is a pointer file
  (submodules and linked worktrees, including `commondir`).
- Command Palette entries that act on the active editor's file.
- Clear, non-blocking feedback, with an "Open" action to jump to the file just
  written, and a guard for files outside the open workspace folder.
- Verification: `npm test` runs pure pattern/escaping unit tests plus runtime
  smoke tests that drive both commands against a mocked VS Code API over a real
  temporary repository.
