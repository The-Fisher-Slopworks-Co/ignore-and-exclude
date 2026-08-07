# CLAUDE.md

Ignore & Exclude is a VS Code extension that adds two context-menu commands
for files and folders — **Add to .gitignore** and **Add to .git/info/exclude** —
plus an Explorer sidebar view that lists the entries of both files, with a
checkbox per entry (disabling comments the line out with the `#off ` marker)
and inline remove/open actions.

## Commands

```bash
npm install
npm run compile     # tsc -p ./  → out/   (tests run against out/, so compile first)
npm run watch       # recompile on change
npm test            # compile + pattern unit tests + runtime smoke tests (the gate)
npm run check       # pure pattern/escaping unit tests (needs a prior compile)
npm run smoke       # drive both commands against a mocked vscode + temp repo
npm run make:icon   # regenerate icon.png (dependency-free PNG encoder)
```

Run from source: `npm run compile`, then press **F5** in VS Code to launch an
Extension Development Host. Package: `npx @vscode/vsce package` → `*.vsix`.

## Architecture

Four source files in `src/` (compiled to `out/`):

- `pattern.ts` — **pure functions, no `vscode` and no `fs`.** Turns a
  workspace-relative path into an anchored, escaped gitignore pattern, and
  manages the lines of an ignore file (`lineExists`, `appendLine`,
  `parseIgnoreFile`, `setLineEnabled`, `removeLine`, and the `#off ` disabled
  marker). Tested by `scripts/check-pattern.mjs`.
- `core.ts` — **`vscode`-free** filesystem layer: resolves the target file
  (`.gitignore`, or `.git/info/exclude` including `.git`-pointer-file and
  worktree `commondir` cases), writes the entry idempotently, and
  lists/toggles/removes entries for the view. Driven against a real temp repo
  by `scripts/smoke-test.mjs`.
- `extension.ts` — the `vscode` adapter for the commands: registers the two
  add commands, resolves the selected resource(s) to workspace folders, calls
  `core.ts`, and reports results.
- `view.ts` — the `vscode` adapter for the sidebar: the `ignoreAndExclude.entries`
  Explorer tree view (checkbox toggling, remove/open actions, file watchers).
  Keep `vscode` usage confined to `extension.ts` and `view.ts`.

## Conventions

- **Patterns are root-anchored** (leading `/`) so they match exactly one file.
  Glob metacharacters and trailing spaces are escaped in `pattern.ts` — keep
  that the single source of escaping truth.
- **Compliance:** AGPL-3.0-or-later, REUSE-compliant. Source (`*.ts`, `*.mjs`)
  and YAML carry a two-line inline SPDX header; JSON/binaries/docs are covered
  by the `**` wildcard in `REUSE.toml`. Run `reuse lint` to verify.
- **Releases:** push a `vX.Y.Z` tag; `.github/workflows/release.yml` runs the
  test gate, packages the `.vsix`, and attaches it to a GitHub Release.
