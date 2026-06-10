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
const { toIgnorePattern, lineExists, appendLine } = require('../out/pattern.js');

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

console.log(`\nAll ${passed} pattern checks passed ✅`);
