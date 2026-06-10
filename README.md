<!--
SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Slopworks project template

The starting point for new [The Fisher Slopworks Co](https://github.com/The-Fisher-Slopworks-Co)
repositories. It ships the **licensing baseline** every project must carry
physically (licensing can't be inherited), already wired up and passing checks:

- **License — AGPL-3.0-or-later.** Root [`LICENSE`](LICENSE) plus the canonical
  SPDX text in [`LICENSES/`](LICENSES/).
- **[REUSE](https://reuse.software/) compliance.** A [`REUSE.toml`](REUSE.toml)
  that declares the whole tree as `AGPL-3.0-or-later` © *The Fisher Slopworks Co*,
  and a [`reuse.yml`](.github/workflows/reuse.yml) workflow that enforces `reuse lint`
  on every push and pull request.

Governance docs — the **Code of Conduct, security policy, and contributing
guide** — are deliberately **not** shipped here. They are inherited org-wide from
[`The-Fisher-Slopworks-Co/.github`](https://github.com/The-Fisher-Slopworks-Co/.github),
so every repository gets them automatically without a per-repo copy.

## Using it

1. Click **“Use this template” → “Create a new repository”** on GitHub (or
   `gh repo create <name> --template The-Fisher-Slopworks-Co/template`).
2. Clone your new repository and run the initializer once:

   ```bash
   ./scripts/init.sh
   ```

   It asks for the project name and tagline, writes a fresh project `README.md`,
   deletes itself, and runs `reuse lint` to confirm the repository is still
   compliant. (You can also run it non-interactively:
   `./scripts/init.sh "My Project" "A short tagline."`)

## Keeping a project compliant

Every file needs copyright + license information. Source files and YAML carry an
inline two-line SPDX header:

```text
SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
SPDX-License-Identifier: AGPL-3.0-or-later
```

Files that can't hold a comment (JSON, binaries, some docs) are covered by the
`**` default in [`REUSE.toml`](REUSE.toml). Verify any time with:

```bash
reuse lint
```

## License

This template is licensed under [AGPL-3.0-or-later](LICENSE) and is itself
REUSE-compliant.
