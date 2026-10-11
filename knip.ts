// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // `src/extension.ts` comes from package.json `main`; the test and icon
  // scripts are run by path from the npm scripts.
  entry: ["scripts/*.mjs"],
  project: ["src/**/*.ts", "scripts/**/*.mjs"],
  // `uv` is a machine prerequisite, not an npm package.
  ignoreBinaries: ["uvx"],
};

export default config;
