// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The filesystem half of the extension: resolve the right target file and add a
 * pattern to it. Deliberately `vscode`-free — it takes plain absolute paths and
 * talks only to `node:fs`, so it can be driven end-to-end against a real temp
 * directory in the smoke test (scripts/smoke-test.mjs).
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { appendLine, lineExists, toIgnorePattern } from './pattern';

export type Target = 'gitignore' | 'exclude';

export interface EntryResult {
  /** Workspace-relative POSIX path of the file or directory we were asked to ignore. */
  relativePath: string;
  /** The pattern line that was (or would be) written. */
  pattern: string;
  target: Target;
  /** Absolute path of the file we wrote to. */
  file: string;
  status: 'added' | 'skipped' | 'error';
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
export async function resolveExcludeFile(workspaceRoot: string): Promise<string> {
  const dotGit = path.join(workspaceRoot, '.git');

  let stat: import('node:fs').Stats;
  try {
    stat = await fs.stat(dotGit);
  } catch {
    return path.join(dotGit, 'info', 'exclude');
  }

  let gitDir: string;
  if (stat.isDirectory()) {
    gitDir = dotGit;
  } else {
    const pointer = await fs.readFile(dotGit, 'utf8');
    const match = pointer.match(/^gitdir:\s*(.+?)\s*$/m);
    if (!match) {
      return path.join(dotGit, 'info', 'exclude');
    }
    gitDir = path.resolve(workspaceRoot, match[1]);
  }

  // A linked worktree's gitdir contains a `commondir` file pointing at the main
  // git directory, which is where info/exclude actually lives.
  try {
    const commondir = (await fs.readFile(path.join(gitDir, 'commondir'), 'utf8')).trim();
    if (commondir) {
      gitDir = path.resolve(gitDir, commondir);
    }
  } catch {
    // No commondir — a plain repository or submodule. Use gitDir as-is.
  }

  return path.join(gitDir, 'info', 'exclude');
}

async function readIfExists(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
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
  const relativePath = relativeNative.split(path.sep).join('/');

  if (relativeNative === '' || relativeNative.startsWith('..') || path.isAbsolute(relativeNative)) {
    return {
      relativePath: relativePath || targetFsPath,
      pattern: '',
      target,
      file: '',
      status: 'error',
      message: `"${path.basename(targetFsPath)}" is outside the workspace folder.`,
    };
  }

  // A git ignore pattern is a single line, so a path containing a newline (or any
  // other control character) cannot be represented without corrupting the file
  // and silently over-ignoring unrelated files. Refuse rather than write garbage.
  if (hasControlCharacter(relativePath)) {
    return {
      relativePath,
      pattern: '',
      target,
      file: '',
      status: 'error',
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
  const file =
    target === 'gitignore'
      ? path.join(workspaceRoot, '.gitignore')
      : await resolveExcludeFile(workspaceRoot);

  const content = await readIfExists(file);
  if (lineExists(content, pattern)) {
    return { relativePath, pattern, target, file, status: 'skipped' };
  }

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, appendLine(content, pattern), 'utf8');
  return { relativePath, pattern, target, file, status: 'added' };
}
