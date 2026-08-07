<!--
SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Ignore & Exclude

A tiny VS Code extension that adds two entries to the right-click menu of any
file or folder:

- **Add to `.gitignore`** — ignore it for everyone (the entry is committed).
- **Add to `.git/info/exclude`** — ignore it for **you only**, without
  touching a tracked file (nothing to commit).

## Why both?

`.gitignore` is shared with your team through version control. `.git/info/exclude`
is local to your clone — perfect for personal scratch files, editor junk, or
local config you don't want to push and don't want to force on anyone else.
This extension makes either one a single click away.

## Usage

Right-click a file or folder in the **Explorer** (or a file on an editor tab)
and choose:

- **Add to .gitignore**, or
- **Add to .git/info/exclude**

The same commands are available from the Command Palette (they act on the
active editor's file). You can select several items and add them all at once.

### What gets written

Each entry is written as a **root-anchored, exactly-matching** pattern, so only
that file or folder is ignored — never same-named entries elsewhere in the tree.
A folder gets a trailing slash, so it matches only the directory and never a
same-named file beside it:

```gitignore
/secret.txt
/build/artifact.bin
/logs/                 # a folder, matched with a trailing slash
/logs/today\[1\].txt   # glob metacharacters in the name are escaped
```

Adding an entry that's already listed is a no-op — the extension won't create
duplicate lines. Items outside the open workspace folder are reported with a
clear error instead of writing somewhere unexpected. Repositories whose `.git`
is a pointer file (submodules and linked worktrees) are resolved correctly, so
the exclude entry lands in the real git directory.

## The sidebar panel

The **Ignore & Exclude** view in the Explorer sidebar lists every entry of
`.gitignore` and `.git/info/exclude`, grouped per file (and per folder in a
multi-root workspace). It shows hand-written entries too — anything that isn't
a comment or a blank line — so it works on existing ignore files, not just
ones this extension wrote.

- **Checkbox** — toggle an entry off and on without losing it. A disabled
  entry stays in the file, commented out as `#off /pattern`, and re-checking
  restores exactly the same line. Adding the same path again from the context
  menu also just re-enables it.
- **Trash icon** — delete the entry's line for good.
- **Click an entry** to jump to its line in the underlying file; the file rows
  have an open-file action of their own.
- The view refreshes automatically when either file changes on disk, and the
  title bar has a manual refresh button just in case.

## Develop / run from source

```bash
npm install
npm run compile
# then press F5 in VS Code to launch an Extension Development Host
```

Other scripts:

```bash
npm test            # compile + pattern unit tests + runtime smoke tests
npm run watch       # recompile on change
npm run check       # pure pattern/escaping unit tests (after compile)
npm run smoke       # drive both commands against a mocked VS Code + temp repo
npm run make:icon   # regenerate icon.png
```

You can also install the packaged build directly:

```bash
npx @vscode/vsce package           # produces ignore-and-exclude-0.3.0.vsix
code --install-extension ignore-and-exclude-0.3.0.vsix
```

Tagged releases (`v*`) are built and published automatically by CI, which
attaches the packaged `.vsix` to the corresponding
[GitHub Release](https://github.com/The-Fisher-Slopworks-Co/ignore-and-exclude/releases).

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

This project is [REUSE](https://reuse.software/)-compliant.
