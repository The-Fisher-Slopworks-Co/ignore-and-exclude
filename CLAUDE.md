# CLAUDE.md

Ignore & Exclude is a VS Code extension that adds two context-menu commands
for files and folders — **Add to .gitignore** and **Add to .git/info/exclude** —
plus an Explorer sidebar view that lists the entries of both files, with a
checkbox per entry (disabling comments the line out with the `#off ` marker)
and inline remove/open actions.

## Commands

```bash
npm install         # also installs the lefthook pre-commit hook (`prepare`)
npm run check       # the gate: typecheck + lint + format:check + knip + reuse + test
npm run compile     # tsc -p ./  → out/   (tests run against out/, so compile first)
npm run watch       # recompile on change
npm test            # compile + pattern unit tests + runtime smoke tests
npm run test:pattern  # pure pattern/escaping unit tests (needs a prior compile)
npm run smoke       # drive both commands against a mocked vscode + temp repo
npm run lint        # oxlint (`.oxlintrc.json`)
npm run format      # prettier --write; `format:check` only checks
npm run knip        # unused files, exports and dependencies (`knip.ts`)
npm run make:icon   # regenerate icon.png (dependency-free PNG encoder)
```

`npm run reuse` runs `uvx reuse lint`, so the gate needs
[uv](https://docs.astral.sh/uv/) on the machine. CI runs the same steps:
`.github/workflows/check.yml` (all but REUSE) and `reuse.yml`.

Run from source: `npm run compile`, then press **F5** in VS Code to launch an
Extension Development Host. Package: `npx @vscode/vsce package` → `*.vsix`.

## Definition of done

- **Issues and pull requests are written in English** — title and body, whatever language the task was discussed in.
- **Never commit to main.** Every task starts on a fresh branch off `origin/main`, named `<type>/<short-task>` — `fix/`, `feat/`, `refactor/`, `chore/`.
- **One task = one branch = one PR.** Past ~300 changed lines, split it into several PRs. `.github/workflows/pr-size.yml` labels every PR `size:XS`…`size:XXL`; **`size:XL` or `size:XXL` means split the PR**, not "explain why it is large".
- **PR title is the squash commit subject:** conventional commit with a scope, enforced by `.github/workflows/pr-title.yml`.
  - Type: `feat` `fix` `refactor` `chore` `docs` `test` `ci` `perf` `revert`.
  - Scope (required): a top-level `src/` module — `core` `extension` `pattern` `view` — or `deps` `github` `release`. A new module means adding it to the `scopes:` list in that workflow.
  - Subject: lowercase start, imperative, no trailing period.
  - The body describes this PR alone, following the PR template.
- **No AI attribution.** No `Assisted-by:` / `Co-Authored-By: <LLM>` trailers, no agent as commit author or committer, and no "Generated with/by …" lines or agent-platform links in PR bodies. The PR body becomes the squash commit body, so the PR title workflow checks the title, the body and every commit of the PR.
- **Before opening:** `npm run check` green, then open the PR and report its URL.
- **Never merge locally.** Merging happens on GitHub, squash only.

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
  check gate (`check.yml`), packages the `.vsix`, and attaches it to a GitHub
  Release. Dev tooling configs stay out of the `.vsix` through `.vscodeignore`.
