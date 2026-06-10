// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The thin `vscode` adapter: register the two context-menu commands, resolve the
 * selected resource(s) into workspace folders, and hand the real work to
 * `core.ts`. Everything user-facing (resolving selections, reporting results)
 * lives here; the path math and file writes are kept vscode-free for testing.
 */
import * as vscode from 'vscode';
import { addEntry, EntryResult, Target } from './core';

const TARGET_LABEL: Record<Target, string> = {
  gitignore: '.gitignore',
  exclude: '.git/info/exclude',
};

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ignoreAndExclude.addToGitignore',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => run('gitignore', uri, uris),
    ),
    vscode.commands.registerCommand(
      'ignoreAndExclude.addToGitExclude',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => run('exclude', uri, uris),
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions, disposed by VSCode.
}

/**
 * Work out which file(s) the command targets. The Explorer passes
 * `(clickedUri, selectedUris)`; an editor-title click passes a single uri; the
 * Command Palette passes nothing, so we fall back to the active editor.
 */
function collectUris(uri?: vscode.Uri, uris?: vscode.Uri[]): vscode.Uri[] {
  const onlyFiles = (list: vscode.Uri[]): vscode.Uri[] =>
    list.filter((u) => u && u.scheme === 'file');

  if (uris && uris.length > 0) {
    return onlyFiles(uris);
  }
  if (uri) {
    return onlyFiles([uri]);
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  return active ? onlyFiles([active]) : [];
}

async function run(target: Target, uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
  const label = TARGET_LABEL[target];
  const files = collectUris(uri, uris);
  if (files.length === 0) {
    vscode.window.showWarningMessage(
      `Ignore & Exclude: open or select a file to add to ${label}.`,
    );
    return;
  }

  const results: EntryResult[] = [];
  for (const file of files) {
    const folder = vscode.workspace.getWorkspaceFolder(file);
    if (!folder) {
      results.push({
        relativePath: file.fsPath,
        pattern: '',
        target,
        file: '',
        status: 'error',
        message: `"${file.fsPath}" is not inside an open workspace folder.`,
      });
      continue;
    }
    try {
      results.push(await addEntry(folder.uri.fsPath, file.fsPath, target));
    } catch (error) {
      results.push({
        relativePath: file.fsPath,
        pattern: '',
        target,
        file: '',
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  await report(target, results);
}

async function report(target: Target, results: EntryResult[]): Promise<void> {
  const label = TARGET_LABEL[target];
  const added = results.filter((r) => r.status === 'added');
  const skipped = results.filter((r) => r.status === 'skipped');
  const errors = results.filter((r) => r.status === 'error');

  if (errors.length > 0) {
    vscode.window.showErrorMessage(
      `Ignore & Exclude: ${errors.map((e) => e.message).join(' ')}`,
    );
  }

  if (added.length > 0) {
    const message =
      added.length === 1
        ? `Added ${added[0].relativePath} to ${label}.`
        : `Added ${added.length} files to ${label}.`;
    const open = `Open ${label}`;
    const choice = await vscode.window.showInformationMessage(message, open);
    if (choice === open) {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(added[0].file),
      );
      await vscode.window.showTextDocument(document);
    }
    return;
  }

  if (errors.length === 0 && skipped.length > 0) {
    vscode.window.showInformationMessage(
      skipped.length === 1
        ? `${skipped[0].relativePath} is already in ${label}.`
        : `All ${skipped.length} files are already in ${label}.`,
    );
  }
}
