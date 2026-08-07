// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Unit tests for the pure pattern helpers (out/pattern.js). These need no
 * `vscode` and no filesystem — they pin down the gitignore-escaping rules that
 * the whole extension relies on. Run after compiling: node scripts/check-pattern.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  toIgnorePattern,
  lineExists,
  appendLine,
  parseIgnoreFile,
  setLineEnabled,
  removeLine,
  DISABLED_PREFIX,
} = require('../out/pattern.js');

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`✓ ${name}`);
};

test('a root file is anchored with a leading slash', () => {
  assert.equal(toIgnorePattern('secret.txt'), '/secret.txt');
});

test('a nested file keeps its slashes and is anchored', () => {
  assert.equal(toIgnorePattern('src/keys/api.pem'), '/src/keys/api.pem');
});

test('glob metacharacters in a segment are escaped', () => {
  assert.equal(toIgnorePattern('a[1].log'), '/a\\[1\\].log');
  assert.equal(toIgnorePattern('weird*?name.txt'), '/weird\\*\\?name.txt');
});

test('a backslash in a name is escaped', () => {
  assert.equal(toIgnorePattern('a\\b.txt'), '/a\\\\b.txt');
});

test('a trailing space is escaped so git does not strip it', () => {
  assert.equal(toIgnorePattern('trailing .txt'), '/trailing .txt');
  assert.equal(toIgnorePattern('trailing.txt '), '/trailing.txt\\ ');
});

test('separators are preserved, never escaped', () => {
  const p = toIgnorePattern('a/b/c.txt');
  assert.equal(p, '/a/b/c.txt');
});

test('a directory gets a trailing slash so it matches only the directory', () => {
  assert.equal(toIgnorePattern('build', true), '/build/');
  assert.equal(toIgnorePattern('src/generated', true), '/src/generated/');
});

test('a directory name with glob metacharacters is escaped and slash-terminated', () => {
  assert.equal(toIgnorePattern('cache[x]', true), '/cache\\[x\\]/');
});

test('lineExists matches an existing entry regardless of whitespace/newlines', () => {
  const content = 'node_modules/\r\n/secret.txt\n\n# a comment\n';
  assert.equal(lineExists(content, '/secret.txt'), true);
  assert.equal(lineExists(content, '  /secret.txt  '), true);
  assert.equal(lineExists(content, '/other.txt'), false);
});

test('lineExists does not treat a comment as the pattern', () => {
  const content = '# /secret.txt\n';
  assert.equal(lineExists(content, '/secret.txt'), false);
});

test('appendLine adds a trailing newline to empty content', () => {
  assert.equal(appendLine('', '/a.txt'), '/a.txt\n');
});

test('appendLine inserts a missing newline before appending', () => {
  assert.equal(appendLine('node_modules/', '/a.txt'), 'node_modules/\n/a.txt\n');
});

test('appendLine does not double a present trailing newline', () => {
  assert.equal(appendLine('node_modules/\n', '/a.txt'), 'node_modules/\n/a.txt\n');
});

// ---- sidebar-view helpers: parse / toggle / remove --------------------------

test('the disabled marker starts with # so git still reads the line as a comment', () => {
  assert.ok(DISABLED_PREFIX.startsWith('#'));
});

test('parseIgnoreFile lists entries in order, skipping blanks and comments', () => {
  const entries = parseIgnoreFile('# header\n\n/a.txt\n#off /b.txt\nnode_modules/\n');
  assert.deepEqual(entries, [
    { pattern: '/a.txt', enabled: true, line: 2 },
    { pattern: '/b.txt', enabled: false, line: 3 },
    { pattern: 'node_modules/', enabled: true, line: 4 },
  ]);
});

test('parseIgnoreFile handles CRLF files', () => {
  const entries = parseIgnoreFile('/a.txt\r\n#off /b.txt\r\n');
  assert.deepEqual(
    entries.map((e) => [e.pattern, e.enabled, e.line]),
    [['/a.txt', true, 0], ['/b.txt', false, 1]],
  );
});

test('a bare disabled marker with no pattern is a comment, not an entry', () => {
  assert.deepEqual(parseIgnoreFile('#off \n#off\n'), []);
});

test('setLineEnabled(false) comments the line out with the marker', () => {
  assert.equal(setLineEnabled('/a.txt\n/b.txt\n', '/a.txt', false), '#off /a.txt\n/b.txt\n');
});

test('setLineEnabled(true) strips the marker again', () => {
  assert.equal(setLineEnabled('#off /a.txt\n/b.txt\n', '/a.txt', true), '/a.txt\n/b.txt\n');
});

test('setLineEnabled preserves CRLF newlines of untouched lines', () => {
  assert.equal(
    setLineEnabled('/a.txt\r\n/b.txt\r\n', '/b.txt', false),
    '/a.txt\r\n#off /b.txt\r\n',
  );
});

test('setLineEnabled leaves the content alone when nothing matches', () => {
  const content = '/a.txt\n';
  assert.equal(setLineEnabled(content, '/missing.txt', false), content);
  assert.equal(setLineEnabled(content, '/a.txt', true), content, 'already enabled');
});

test('setLineEnabled never mistakes an ordinary comment for a disabled entry', () => {
  const content = '# /a.txt\n';
  assert.equal(setLineEnabled(content, '/a.txt', true), content);
});

test('removeLine deletes the line together with its newline', () => {
  assert.equal(removeLine('/a.txt\n/b.txt\n', '/a.txt', true), '/b.txt\n');
  assert.equal(removeLine('/a.txt\n/b.txt\n', '/b.txt', true), '/a.txt\n');
});

test('removeLine matches the enabled/disabled state it is asked for', () => {
  const content = '#off /a.txt\n';
  assert.equal(removeLine(content, '/a.txt', true), content, 'no enabled line to remove');
  assert.equal(removeLine(content, '/a.txt', false), '');
});

test('removeLine copes with a final line that has no trailing newline', () => {
  assert.equal(removeLine('/a.txt\n/b.txt', '/b.txt', true), '/a.txt');
  assert.equal(removeLine('/only.txt', '/only.txt', true), '');
});

console.log(`\nAll ${passed} pattern checks passed ✅`);
