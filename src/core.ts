// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The filesystem half of the extension: resolve the right target file, add a
 * pattern to it, and list/toggle/remove the entries the sidebar view shows.
 * Deliberately `vscode`-free — it takes plain absolute paths and talks only to
 * `node:fs`, so it can be driven end-to-end against a real temp directory in
 * the smoke test (scripts/smoke-test.mjs).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  appendLine,
  IgnoreEntry,
  lineExists,
  parseIgnoreFile,
  removeLine,
  setLineEnabled,
  toIgnorePattern,
} from "./pattern";

export type Target = "gitignore" | "exclude";

/** Human-readable name of the ignore file behind each target. */
export const TARGET_LABEL: Record<Target, string> = {
  gitignore: ".gitignore",
  exclude: ".git/info/exclude",
};

export interface EntryResult {
  /** Workspace-relative POSIX path of the file or directory we were asked to ignore. */
  relativePath: string;
  /** The pattern line that was (or would be) written. */
  pattern: string;
  target: Target;
  /** Absolute path of the file we wrote to. */
  file: string;
  status: "added" | "skipped" | "error";
  message?: string;
}

/**
 * True if `value` contains a C0 control character or DEL. These are legal in
 * POSIX filenames but cannot appear in a single-line git ignore pattern without
 * corrupting the file, so we screen for them before writing anything.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve the absolute path of `info/exclude` for the repository rooted at
 * `workspaceRoot`. Handles the three shapes `.git` can take:
 *   - a normal directory: `<root>/.git/info/exclude`;
 *   - a gitdir pointer file (`gitdir: ...`), used by submodules and worktrees;
 *   - a worktree gitdir that defers to a `commondir` — excludes live in the
 *     shared common dir, not the per-worktree dir.
 * If `.git` is absent we still return the conventional location so the caller
 * can create it.
 */
export async function resolveExcludeFile(
  workspaceRoot: string,
): Promise<string> {
  const dotGit = path.join(workspaceRoot, ".git");

  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(dotGit);
  } catch {
    return path.join(dotGit, "info", "exclude");
  }

  let gitDir: string;
  if (stat.isDirectory()) {
    gitDir = dotGit;
  } else {
    const pointer = await fs.readFile(dotGit, "utf8");
    const pointed = pointer.match(/^gitdir:\s*(.+?)\s*$/m)?.[1];
    if (!pointed) {
      return path.join(dotGit, "info", "exclude");
    }
    gitDir = path.resolve(workspaceRoot, pointed);
  }

  // A linked worktree's gitdir contains a `commondir` file pointing at the main
  // git directory, which is where info/exclude actually lives.
  try {
    const commondir = (
      await fs.readFile(path.join(gitDir, "commondir"), "utf8")
    ).trim();
    if (commondir) {
      gitDir = path.resolve(gitDir, commondir);
    }
  } catch {
    // No commondir — a plain repository or submodule. Use gitDir as-is.
  }

  return path.join(gitDir, "info", "exclude");
}

async function readIfExists(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * Add `targetFsPath` to the chosen ignore file for its workspace. Idempotent:
 * if the anchored pattern is already present the file is left untouched and the
 * result is reported as `skipped`. Returns a structured result instead of
 * throwing for the expected "outside the workspace" / "unrepresentable name"
 * cases.
 */
export async function addEntry(
  workspaceRoot: string,
  targetFsPath: string,
  target: Target,
): Promise<EntryResult> {
  const relativeNative = path.relative(workspaceRoot, targetFsPath);
  const relativePath = relativeNative.split(path.sep).join("/");

  if (
    relativeNative === "" ||
    relativeNative.startsWith("..") ||
    path.isAbsolute(relativeNative)
  ) {
    return {
      relativePath: relativePath || targetFsPath,
      pattern: "",
      target,
      file: "",
      status: "error",
      message: `"${path.basename(targetFsPath)}" is outside the workspace folder.`,
    };
  }

  // A git ignore pattern is a single line, so a path containing a newline (or any
  // other control character) cannot be represented without corrupting the file
  // and silently over-ignoring unrelated files. Refuse rather than write garbage.
  if (hasControlCharacter(relativePath)) {
    return {
      relativePath,
      pattern: "",
      target,
      file: "",
      status: "error",
      message: `"${path.basename(targetFsPath)}" can't be ignored: its name contains a control character that a git ignore pattern can't represent.`,
    };
  }

  // A directory is ignored with a trailing-slash pattern so it matches only the
  // directory, never a same-named regular file beside it. Statting is safe here:
  // paths outside the workspace and unrepresentable names were already rejected,
  // and a real Explorer/editor selection always exists on disk.
  let isDirectory = false;
  try {
    isDirectory = (await fs.stat(targetFsPath)).isDirectory();
  } catch {
    // Unstattable (e.g. just deleted) — fall back to a plain file pattern.
  }

  const pattern = toIgnorePattern(relativePath, isDirectory);
  const file = await ignoreFilePath(workspaceRoot, target);

  const content = await readIfExists(file);
  if (lineExists(content, pattern)) {
    return { relativePath, pattern, target, file, status: "skipped" };
  }

  // A copy disabled from the sidebar view (`#off ` marker) is re-enabled in
  // place instead of being appended a second time.
  const reEnabled = setLineEnabled(content, pattern, true);
  const updated =
    reEnabled !== content ? reEnabled : appendLine(content, pattern);

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, updated, "utf8");
  return { relativePath, pattern, target, file, status: "added" };
}

/** Absolute path of the ignore file backing `target` for this workspace. */
async function ignoreFilePath(
  workspaceRoot: string,
  target: Target,
): Promise<string> {
  return target === "gitignore"
    ? path.join(workspaceRoot, ".gitignore")
    : resolveExcludeFile(workspaceRoot);
}

/** The parsed contents of one ignore file, for the sidebar view. */
export interface IgnoreFileEntries {
  target: Target;
  /** Absolute path of the ignore file (it may not exist yet). */
  file: string;
  entries: IgnoreEntry[];
}

/** Parse both ignore files of a workspace folder (a missing file has no entries). */
export async function listEntries(
  workspaceRoot: string,
): Promise<IgnoreFileEntries[]> {
  const targets: Target[] = ["gitignore", "exclude"];
  return Promise.all(
    targets.map(async (target) => {
      const file = await ignoreFilePath(workspaceRoot, target);
      return {
        target,
        file,
        entries: parseIgnoreFile(await readIfExists(file)),
      };
    }),
  );
}

/**
 * Toggle an entry: disabling comments the line out with the `#off ` marker,
 * enabling strips the marker again. Returns false — writing nothing — when no
 * matching line was found (the file changed under us).
 */
export async function setEntryEnabled(
  workspaceRoot: string,
  target: Target,
  pattern: string,
  enabled: boolean,
): Promise<boolean> {
  const file = await ignoreFilePath(workspaceRoot, target);
  const content = await readIfExists(file);
  const updated = setLineEnabled(content, pattern, enabled);
  if (updated === content) {
    return false;
  }
  await fs.writeFile(file, updated, "utf8");
  return true;
}

/** Delete an entry's line outright. Returns false when it was already gone. */
export async function removeEntry(
  workspaceRoot: string,
  target: Target,
  pattern: string,
  enabled: boolean,
): Promise<boolean> {
  const file = await ignoreFilePath(workspaceRoot, target);
  const content = await readIfExists(file);
  const updated = removeLine(content, pattern, enabled);
  if (updated === content) {
    return false;
  }
  await fs.writeFile(file, updated, "utf8");
  return true;
}
