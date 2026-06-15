// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pure, dependency-free helpers for turning a workspace-relative file path into
 * a gitignore pattern and for managing the lines of a `.gitignore` /
 * `.git/info/exclude` file. No `vscode` and no `fs` imports live here, so this
 * module is unit-testable with plain Node (see scripts/check-pattern.mjs).
 *
 * Git's pattern syntax (gitignore(5)) treats several characters specially:
 *   - a leading `#` starts a comment, a leading `!` negates;
 *   - `*`, `?`, `[` are glob metacharacters;
 *   - a trailing space is stripped unless escaped as `\ `.
 * To turn a literal path into a pattern that matches that exact file and nothing
 * else, we anchor it with a leading `/` (so it is relative to the file's
 * directory, never matched "at any level") and escape the glob metacharacters
 * in each path segment.
 */

/** Escape the gitignore glob metacharacters within a single path segment. */
function escapeSegment(segment: string): string {
  return segment.replace(/([\\*?[\]])/g, '\\$1');
}

/** Escape any run of trailing spaces so git does not strip them. */
function escapeTrailingSpaces(pattern: string): string {
  return pattern.replace(/ +$/, (spaces) => spaces.replace(/ /g, '\\ '));
}

/**
 * Build an anchored gitignore pattern for a workspace-relative POSIX path.
 *
 *   "secret.txt"           -> "/secret.txt"
 *   "src/keys/api.pem"     -> "/src/keys/api.pem"
 *   "a[1].log"             -> "/a\\[1\\].log"
 *   "build" (isDirectory)  -> "/build/"
 *
 * The leading slash anchors the pattern to the directory of the ignore file
 * (the workspace root, where we write both files), so it matches that one entry
 * and not same-named entries in other folders. A directory additionally gets a
 * trailing slash so the pattern matches only the directory, never a same-named
 * regular file beside it.
 */
export function toIgnorePattern(posixRelativePath: string, isDirectory = false): string {
  const segments = posixRelativePath.split('/').filter((s) => s.length > 0);
  const anchored = '/' + segments.map(escapeSegment).join('/');
  const escaped = escapeTrailingSpaces(anchored);
  return isDirectory ? escaped + '/' : escaped;
}

/**
 * Does `content` already contain `pattern` as its own (non-comment) line?
 * Comparison ignores surrounding whitespace and tolerates either newline style.
 */
export function lineExists(content: string, pattern: string): boolean {
  const target = pattern.trim();
  return content.split(/\r?\n/).some((line) => line.trim() === target);
}

/**
 * Append `line` to `content`, guaranteeing it lands on its own line with a
 * trailing newline and without introducing a blank line of its own.
 */
export function appendLine(content: string, line: string): string {
  if (content.length === 0) {
    return line + '\n';
  }
  const separator = content.endsWith('\n') ? '' : '\n';
  return content + separator + line + '\n';
}
