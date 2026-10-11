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
  return segment.replace(/([\\*?[\]])/g, "\\$1");
}

/** Escape any run of trailing spaces so git does not strip them. */
function escapeTrailingSpaces(pattern: string): string {
  return pattern.replace(/ +$/, (spaces) => spaces.replace(/ /g, "\\ "));
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
export function toIgnorePattern(
  posixRelativePath: string,
  isDirectory = false,
): string {
  const segments = posixRelativePath.split("/").filter((s) => s.length > 0);
  const anchored = "/" + segments.map(escapeSegment).join("/");
  const escaped = escapeTrailingSpaces(anchored);
  return isDirectory ? escaped + "/" : escaped;
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
    return line + "\n";
  }
  const separator = content.endsWith("\n") ? "" : "\n";
  return content + separator + line + "\n";
}

/**
 * Marker that comments out an entry disabled from the sidebar view. Distinct
 * from a plain `#` comment so genuine comments are never presented (or
 * re-enabled) as entries: only lines carrying this exact prefix toggle back on.
 * To git the line is still just a comment.
 */
export const DISABLED_PREFIX = "#off ";

/** One toggleable line of an ignore file, as shown in the sidebar view. */
export interface IgnoreEntry {
  /** The pattern text, without the disabled marker. */
  pattern: string;
  /** False when the line is commented out with `DISABLED_PREFIX`. */
  enabled: boolean;
  /** 0-based line number in the file. */
  line: number;
}

/**
 * Classify one raw line: an active pattern, a disabled (`#off `-prefixed)
 * pattern, or neither (blank lines and ordinary comments).
 */
function parseLine(raw: string): { pattern: string; enabled: boolean } | null {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  if (text.startsWith(DISABLED_PREFIX)) {
    const pattern = text.slice(DISABLED_PREFIX.length).trim();
    return pattern.length > 0 ? { pattern, enabled: false } : null;
  }
  if (text.startsWith("#")) {
    return null;
  }
  return { pattern: text, enabled: true };
}

/** Every active or disabled entry of an ignore file, in file order. */
export function parseIgnoreFile(content: string): IgnoreEntry[] {
  const entries: IgnoreEntry[] = [];
  content.split(/\r?\n/).forEach((raw, line) => {
    const parsed = parseLine(raw);
    if (parsed) {
      entries.push({ ...parsed, line });
    }
  });
  return entries;
}

/**
 * Split `content` so lines sit at even indices and the newline runs that
 * separate them (either style) at odd indices — editing one line and joining
 * the parts back preserves every other byte of the file.
 */
function splitKeepingNewlines(content: string): string[] {
  return content.split(/(\r?\n)/);
}

/**
 * Comment an entry out with `DISABLED_PREFIX` (`enabled = false`) or strip the
 * marker again (`enabled = true`). Rewrites the first line carrying `pattern`
 * in the opposite state; returns `content` unchanged when there is none.
 */
export function setLineEnabled(
  content: string,
  pattern: string,
  enabled: boolean,
): string {
  const target = pattern.trim();
  const parts = splitKeepingNewlines(content);
  for (let i = 0; i < parts.length; i += 2) {
    const parsed = parseLine(parts[i]);
    if (parsed && parsed.pattern === target && parsed.enabled !== enabled) {
      parts[i] = enabled ? target : DISABLED_PREFIX + target;
      return parts.join("");
    }
  }
  return content;
}

/**
 * Delete the first line carrying `pattern` in the given enabled/disabled
 * state, along with its newline; returns `content` unchanged when there is
 * none.
 */
export function removeLine(
  content: string,
  pattern: string,
  enabled: boolean,
): string {
  const target = pattern.trim();
  const parts = splitKeepingNewlines(content);
  for (let i = 0; i < parts.length; i += 2) {
    const parsed = parseLine(parts[i]);
    if (parsed && parsed.pattern === target && parsed.enabled === enabled) {
      if (i + 1 < parts.length) {
        parts.splice(i, 2); // the line and the newline that ends it
      } else {
        parts.splice(i - 1, 2); // the final, newline-less line and the newline before it
      }
      return parts.join("");
    }
  }
  return content;
}
