<!--
SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Ignore & Exclude

A tiny VS Code extension that adds two entries to a file's right-click menu:

- **Add to `.gitignore`** — ignore the file for everyone (the entry is committed).
- **Add to `.git/info/exclude`** — ignore the file for **you only**, without
  touching a tracked file (nothing to commit).

## Why both?

`.gitignore` is shared with your team through version control. `.git/info/exclude`
is local to your clone — perfect for personal scratch files, editor junk, or
local config you don't want to push and don't want to force on anyone else.
This extension makes either one a single click away.

## Usage

Right-click a file in the **Explorer** (or on an editor tab) and choose:

- **Add to .gitignore**, or
- **Add to .git/info/exclude**

The same commands are available from the Command Palette (they act on the
active editor's file). You can select several files and add them all at once.

### What gets written

Each file is written as a **root-anchored, exactly-matching** pattern, so only
that file is ignored — never same-named files elsewhere in the tree:

```gitignore
/secret.txt
/build/artifact.bin
/logs/today\[1\].txt   # glob metacharacters in the name are escaped
```

Adding a file that's already listed is a no-op — the extension won't create
duplicate lines. Files outside the open workspace folder are reported with a
clear error instead of writing somewhere unexpected. Repositories whose `.git`
is a pointer file (submodules and linked worktrees) are resolved correctly, so
the exclude entry lands in the real git directory.

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
npx @vscode/vsce package           # produces ignore-and-exclude-0.1.0.vsix
code --install-extension ignore-and-exclude-0.1.0.vsix
```

Tagged releases (`v*`) are built and published automatically by CI, which
attaches the packaged `.vsix` to the corresponding
[GitHub Release](https://github.com/The-Fisher-Slopworks-Co/ignore-and-exclude/releases).

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

This project is [REUSE](https://reuse.software/)-compliant.
