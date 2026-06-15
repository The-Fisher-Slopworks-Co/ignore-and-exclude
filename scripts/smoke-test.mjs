// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Runtime smoke test: loads the COMPILED extension (out/extension.js) against a
 * mocked `vscode` API and a REAL temporary workspace on disk, then drives both
 * commands end-to-end. This catches what tsc cannot: command-id mismatches,
 * the actual bytes written to .gitignore / .git/info/exclude, de-duplication,
 * multi-select, newline hygiene, worktree (.git-file) resolution, and the
 * out-of-workspace / no-selection guards.
 *
 * Run after compiling:  node scripts/smoke-test.mjs
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

// ---- intercept `require('vscode')` -----------------------------------------
let currentMock = null;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return currentMock.vscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

function fileUri(fsPath) {
  return { scheme: 'file', fsPath, path: fsPath, toString: () => `file://${fsPath}` };
}

function buildMock(root) {
  const calls = { commands: new Map(), info: [], warn: [], error: [], opened: [] };
  const mock = {
    vscode: {
      Uri: { file: (p) => fileUri(p) },
      window: {
        activeTextEditor: undefined,
        showInformationMessage: async (m) => {
          calls.info.push(m);
          return undefined; // never click the "Open" button
        },
        showWarningMessage: async (m) => {
          calls.warn.push(m);
          return undefined;
        },
        showErrorMessage: async (m) => {
          calls.error.push(m);
          return undefined;
        },
        showTextDocument: async (d) => {
          calls.opened.push(d);
          return d;
        },
      },
      commands: {
        registerCommand: (id, handler) => {
          calls.commands.set(id, handler);
          return { dispose() {} };
        },
      },
      workspace: {
        openTextDocument: async (uri) => ({ uri }),
        getWorkspaceFolder: (uri) => {
          const rel = path.relative(root, uri.fsPath);
          if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
            return undefined;
          }
          return { uri: fileUri(root), name: path.basename(root), index: 0 };
        },
      },
    },
    calls,
  };
  return mock;
}

function loadExtension(mock) {
  currentMock = mock;
  for (const name of ['extension', 'core', 'pattern']) {
    delete require.cache[require.resolve(`../out/${name}.js`)];
  }
  const ext = require('../out/extension.js');
  const context = { subscriptions: [] };
  ext.activate(context);
  return ext;
}

const ADD_GITIGNORE = 'ignoreAndExclude.addToGitignore';
const ADD_EXCLUDE = 'ignoreAndExclude.addToGitExclude';

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
};

const workspaces = [];
function freshWorkspace({ gitDir = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'iae-'));
  workspaces.push(root);
  if (gitDir) {
    mkdirSync(path.join(root, '.git', 'info'), { recursive: true });
  }
  return root;
}

// ---- command-id parity with package.json ------------------------------------
await test('both package.json commands are registered (and vice versa)', async () => {
  const pkg = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  const declared = pkg.contributes.commands.map((c) => c.command).sort();
  const mock = buildMock(freshWorkspace());
  loadExtension(mock);
  const registered = [...mock.calls.commands.keys()].sort();
  assert.deepEqual(registered, declared, 'registered commands must match declared commands exactly');
  assert.deepEqual(declared, [ADD_EXCLUDE, ADD_GITIGNORE].sort());
});

// ---- add a root file to .gitignore ------------------------------------------
await test('adds a root file to .gitignore, anchored with a leading slash', async () => {
  const root = freshWorkspace();
  const target = path.join(root, 'secret.txt');
  writeFileSync(target, 'shh');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(target));

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gitignore, '/secret.txt\n');
  assert.equal(mock.calls.info.length, 1);
  assert.match(mock.calls.info[0], /Added secret\.txt to \.gitignore/);
  assert.equal(mock.calls.error.length, 0);
});

// ---- add a nested file to .git/info/exclude ---------------------------------
await test('adds a nested file to .git/info/exclude', async () => {
  const root = freshWorkspace();
  const target = path.join(root, 'build', 'artifact.bin');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'x');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_EXCLUDE)(fileUri(target));

  const exclude = readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(exclude, '/build/artifact.bin\n');
});

// ---- add a directory: matched with a trailing slash -------------------------
await test('adds a directory to .gitignore with a trailing-slash pattern', async () => {
  const root = freshWorkspace();
  const target = path.join(root, 'logs');
  mkdirSync(target, { recursive: true });
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(target));

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gitignore, '/logs/\n');
  assert.match(mock.calls.info[0], /Added logs to \.gitignore/);
  assert.equal(mock.calls.error.length, 0);
});

// ---- add a nested directory to .git/info/exclude ----------------------------
await test('adds a nested directory to .git/info/exclude with a trailing slash', async () => {
  const root = freshWorkspace();
  const target = path.join(root, 'src', 'generated');
  mkdirSync(target, { recursive: true });
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_EXCLUDE)(fileUri(target));

  const exclude = readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(exclude, '/src/generated/\n');
});

// ---- de-duplication: adding the same file twice is idempotent ---------------
await test('adding the same file twice does not duplicate the line', async () => {
  const root = freshWorkspace();
  const target = path.join(root, 'dup.log');
  writeFileSync(target, 'x');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(target));
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(target));

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gitignore, '/dup.log\n', 'exactly one entry');
  assert.ok(mock.calls.info.some((m) => /already in \.gitignore/.test(m)), 'reports the skip');
});

// ---- newline hygiene: a file without a trailing newline gets one ------------
await test('appends cleanly to a .gitignore that lacks a trailing newline', async () => {
  const root = freshWorkspace();
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/');
  const target = path.join(root, 'a.txt');
  writeFileSync(target, 'x');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(target));

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gitignore, 'node_modules/\n/a.txt\n');
});

// ---- multi-select: the Explorer passes (clicked, [selected...]) -------------
await test('multi-select adds every selected file and reports the count', async () => {
  const root = freshWorkspace();
  const a = path.join(root, 'a.txt');
  const b = path.join(root, 'nested', 'b.txt');
  mkdirSync(path.dirname(b), { recursive: true });
  writeFileSync(a, 'x');
  writeFileSync(b, 'x');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(a), [fileUri(a), fileUri(b)]);

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gitignore, '/a.txt\n/nested/b.txt\n');
  assert.ok(mock.calls.info.some((m) => /Added 2 entries to \.gitignore/.test(m)));
});

// ---- glob metacharacters in the name are escaped ----------------------------
await test('a filename with glob metacharacters is escaped in the pattern', async () => {
  const root = freshWorkspace();
  const target = path.join(root, 'log[1].txt');
  writeFileSync(target, 'x');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(target));

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gitignore, '/log\\[1\\].txt\n');
});

// ---- exclude resolution when .git is a worktree/submodule pointer FILE -------
await test('resolves info/exclude when .git is a gitdir pointer file', async () => {
  const root = freshWorkspace({ gitDir: false });
  const realGitDir = path.join(root, '.real-git');
  mkdirSync(path.join(realGitDir, 'info'), { recursive: true });
  writeFileSync(path.join(root, '.git'), `gitdir: ./.real-git\n`);
  const target = path.join(root, 'c.txt');
  writeFileSync(target, 'x');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_EXCLUDE)(fileUri(target));

  const exclude = readFileSync(path.join(realGitDir, 'info', 'exclude'), 'utf8');
  assert.equal(exclude, '/c.txt\n');
});

// ---- exclude resolution follows a worktree commondir ------------------------
await test('resolves info/exclude through a worktree commondir', async () => {
  const root = freshWorkspace({ gitDir: false });
  const worktreeGitDir = path.join(root, '.wt-git');
  const commonGitDir = path.join(root, '.common-git');
  mkdirSync(worktreeGitDir, { recursive: true });
  mkdirSync(path.join(commonGitDir, 'info'), { recursive: true });
  writeFileSync(path.join(worktreeGitDir, 'commondir'), '../.common-git\n');
  writeFileSync(path.join(root, '.git'), `gitdir: ./.wt-git\n`);
  const target = path.join(root, 'd.txt');
  writeFileSync(target, 'x');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_EXCLUDE)(fileUri(target));

  const exclude = readFileSync(path.join(commonGitDir, 'info', 'exclude'), 'utf8');
  assert.equal(exclude, '/d.txt\n');
  assert.ok(!existsSync(path.join(worktreeGitDir, 'info', 'exclude')), 'must not write the per-worktree dir');
});

// ---- a file outside any workspace folder is reported as an error ------------
await test('a file outside the workspace surfaces an error and writes nothing', async () => {
  const root = freshWorkspace();
  const outside = path.join(tmpdir(), 'definitely-outside.txt');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(outside));

  assert.equal(mock.calls.error.length, 1, 'should surface an error');
  assert.ok(!existsSync(path.join(root, '.gitignore')), 'nothing written');
});

// ---- a filename with a control character is refused, nothing written -------
await test('a filename containing a newline is refused and writes nothing', async () => {
  const root = freshWorkspace();
  // A literal newline in the name — legal on POSIX, impossible in a one-line pattern.
  const target = path.join(root, 'a' + String.fromCharCode(10) + 'b.txt');
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(fileUri(target));

  assert.equal(mock.calls.error.length, 1, 'should surface an error');
  assert.match(mock.calls.error[0], /control character/);
  assert.ok(!existsSync(path.join(root, '.gitignore')), 'nothing written');
});

// ---- no selection and no active editor: a gentle warning, no writes ---------
await test('no selection and no active editor warns and writes nothing', async () => {
  const root = freshWorkspace();
  const mock = buildMock(root);
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(undefined, undefined);

  assert.equal(mock.calls.warn.length, 1, 'should warn');
  assert.ok(!existsSync(path.join(root, '.gitignore')), 'nothing written');
});

// ---- the Command Palette path falls back to the active editor ---------------
await test('with no args, falls back to the active editor document', async () => {
  const root = freshWorkspace();
  const target = path.join(root, 'active.txt');
  writeFileSync(target, 'x');
  const mock = buildMock(root);
  mock.vscode.window.activeTextEditor = { document: { uri: fileUri(target) } };
  loadExtension(mock);
  await mock.calls.commands.get(ADD_GITIGNORE)(undefined, undefined);

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(gitignore, '/active.txt\n');
});

// ---- cleanup ----------------------------------------------------------------
Module._load = originalLoad;
for (const dir of workspaces) {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\nAll ${passed} runtime smoke tests passed ✅`);
