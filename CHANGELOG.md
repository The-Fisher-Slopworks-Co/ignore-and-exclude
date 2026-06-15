# Changelog

All notable changes to the **Ignore & Exclude** extension are documented here.

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
