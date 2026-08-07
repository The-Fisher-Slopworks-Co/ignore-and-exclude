// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The command half of the `vscode` layer: register the two context-menu
 * commands, resolve the selected resource(s) into workspace folders, and hand
 * the real work to `core.ts` (the sidebar tree view lives in `view.ts`).
 * Everything user-facing (resolving selections, reporting results) lives here;
 * the path math and file writes are kept vscode-free for testing.
 */
import * as vscode from 'vscode';
import { addEntry, EntryResult, Target, TARGET_LABEL } from './core';
import { IgnoreView, registerIgnoreView } from './view';

export function activate(context: vscode.ExtensionContext): void {
  const view = registerIgnoreView(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ignoreAndExclude.addToGitignore',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => run('gitignore', view, uri, uris),
    ),
    vscode.commands.registerCommand(
      'ignoreAndExclude.addToGitExclude',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => run('exclude', view, uri, uris),
    ),
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions, disposed by VSCode.
}

/**
 * Work out which resource(s) the command targets. The Explorer passes
 * `(clickedUri, selectedUris)`; an editor-title click passes a single uri; the
 * Command Palette passes nothing, so we fall back to the active editor.
 */
function collectUris(uri?: vscode.Uri, uris?: vscode.Uri[]): vscode.Uri[] {
  const onDisk = (list: vscode.Uri[]): vscode.Uri[] =>
    list.filter((u) => u && u.scheme === 'file');

  if (uris && uris.length > 0) {
    return onDisk(uris);
  }
  if (uri) {
    return onDisk([uri]);
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  return active ? onDisk([active]) : [];
}

async function run(
  target: Target,
  view: IgnoreView,
  uri?: vscode.Uri,
  uris?: vscode.Uri[],
): Promise<void> {
  const label = TARGET_LABEL[target];
  const resources = collectUris(uri, uris);
  if (resources.length === 0) {
    vscode.window.showWarningMessage(
      `Ignore & Exclude: open or select a file or folder to add to ${label}.`,
    );
    return;
  }

  const results: EntryResult[] = [];
  for (const resource of resources) {
    const folder = vscode.workspace.getWorkspaceFolder(resource);
    if (!folder) {
      results.push({
        relativePath: resource.fsPath,
        pattern: '',
        target,
        file: '',
        status: 'error',
        message: `"${resource.fsPath}" is not inside an open workspace folder.`,
      });
      continue;
    }
    try {
      results.push(await addEntry(folder.uri.fsPath, resource.fsPath, target));
    } catch (error) {
      results.push({
        relativePath: resource.fsPath,
        pattern: '',
        target,
        file: '',
        status: 'error',
        message: (error as Error).message,
      });
    }
  }

  // The watchers pick file changes up too, but refreshing here is immediate
  // and covers targets they cannot watch (e.g. an exclude file in a repo
  // whose .git directory did not exist when the watchers were built).
  view.refresh();
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
        : `Added ${added.length} entries to ${label}.`;
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
        : `All ${skipped.length} entries are already in ${label}.`,
    );
  }
}
