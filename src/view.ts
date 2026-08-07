// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The sidebar half of the `vscode` layer (extension.ts is the command half):
 * an Explorer tree view listing every entry of `.gitignore` and
 * `.git/info/exclude`, grouped per file — and per workspace folder in a
 * multi-root workspace. Each entry carries a checkbox: unchecking keeps the
 * line in the file but comments it out with the `#off ` marker (pattern.ts),
 * so checking it again restores the exact same pattern. Inline actions delete
 * an entry or jump into the underlying file. All parsing and file writes stay
 * in pattern.ts / core.ts; this module only renders and dispatches.
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  listEntries,
  removeEntry,
  resolveExcludeFile,
  setEntryEnabled,
  Target,
  TARGET_LABEL,
} from './core';
import { DISABLED_PREFIX } from './pattern';

/** Must match the view id contributed in package.json. */
export const VIEW_ID = 'ignoreAndExclude.entries';

interface FolderNode {
  kind: 'folder';
  folder: vscode.WorkspaceFolder;
}

interface FileNode {
  kind: 'file';
  folder: vscode.WorkspaceFolder;
  target: Target;
  /** Absolute path of the ignore file. */
  file: string;
  /** Number of entries, shown as the node's description. */
  count: number;
}

interface EntryNode {
  kind: 'entry';
  folder: vscode.WorkspaceFolder;
  target: Target;
  file: string;
  pattern: string;
  enabled: boolean;
  /** 0-based line number inside `file`. */
  line: number;
}

type IgnoreNode = FolderNode | FileNode | EntryNode;

/** The handle extension.ts uses to refresh the view after its own writes. */
export interface IgnoreView {
  refresh(): void;
}

class IgnoreTreeProvider implements vscode.TreeDataProvider<IgnoreNode>, IgnoreView {
  private readonly emitter = new vscode.EventEmitter<IgnoreNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire(undefined);
  }

  async getChildren(node?: IgnoreNode): Promise<IgnoreNode[]> {
    if (!node) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length <= 1) {
        // Single-root: skip the folder level, show the two files directly.
        return folders.length === 1 ? this.fileNodes(folders[0]) : [];
      }
      const parents: IgnoreNode[] = [];
      for (const folder of folders) {
        if ((await this.fileNodes(folder)).length > 0) {
          parents.push({ kind: 'folder', folder });
        }
      }
      return parents;
    }
    if (node.kind === 'folder') {
      return this.fileNodes(node.folder);
    }
    if (node.kind === 'file') {
      return this.entryNodes(node);
    }
    return [];
  }

  getTreeItem(node: IgnoreNode): vscode.TreeItem {
    if (node.kind === 'folder') {
      const item = new vscode.TreeItem(
        node.folder.name,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `folder:${node.folder.uri.fsPath}`;
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = 'ignoreAndExclude.folder';
      return item;
    }

    if (node.kind === 'file') {
      const item = new vscode.TreeItem(
        TARGET_LABEL[node.target],
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `file:${node.folder.uri.fsPath}:${node.target}`;
      item.description = `${node.count}`;
      item.tooltip = node.file;
      item.iconPath = new vscode.ThemeIcon('file');
      item.contextValue = 'ignoreAndExclude.file';
      return item;
    }

    const item = new vscode.TreeItem(node.pattern, vscode.TreeItemCollapsibleState.None);
    item.id = `entry:${node.file}:${node.line}:${node.pattern}`;
    item.contextValue = 'ignoreAndExclude.entry';
    item.checkboxState = {
      state: node.enabled
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked,
      tooltip: node.enabled ? 'Uncheck to disable this entry' : 'Check to re-enable this entry',
    };
    item.tooltip = node.enabled
      ? `Active in ${TARGET_LABEL[node.target]} — uncheck to disable it. The line is kept, commented out as "${DISABLED_PREFIX}${node.pattern}".`
      : `Disabled — sits in ${TARGET_LABEL[node.target]} as "${DISABLED_PREFIX}${node.pattern}". Check to re-enable it.`;
    item.command = {
      command: 'ignoreAndExclude.openIgnoreFile',
      title: 'Open Ignore File',
      arguments: [node],
    };
    return item;
  }

  private async fileNodes(folder: vscode.WorkspaceFolder): Promise<FileNode[]> {
    const files = await listEntries(folder.uri.fsPath);
    return files
      .filter((f) => f.entries.length > 0)
      .map((f) => ({
        kind: 'file' as const,
        folder,
        target: f.target,
        file: f.file,
        count: f.entries.length,
      }));
  }

  private async entryNodes(node: FileNode): Promise<EntryNode[]> {
    const files = await listEntries(node.folder.uri.fsPath);
    const match = files.find((f) => f.target === node.target);
    if (!match) {
      return [];
    }
    return match.entries.map((entry) => ({
      kind: 'entry' as const,
      folder: node.folder,
      target: node.target,
      file: match.file,
      pattern: entry.pattern,
      enabled: entry.enabled,
      line: entry.line,
    }));
  }
}

/** Create the tree view, its commands, and the file watchers that keep it fresh. */
export function registerIgnoreView(context: vscode.ExtensionContext): IgnoreView {
  const provider = new IgnoreTreeProvider();
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  let watchers: vscode.Disposable[] = [];
  const disposeWatchers = () => {
    for (const watcher of watchers) {
      watcher.dispose();
    }
    watchers = [];
  };

  // Watch every folder's .gitignore and resolved info/exclude so edits made
  // outside the view (or outside VS Code) show up without a manual refresh.
  const rebuildWatchers = async () => {
    disposeWatchers();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const exclude = await resolveExcludeFile(folder.uri.fsPath);
      const globs = [
        new vscode.RelativePattern(folder, '.gitignore'),
        new vscode.RelativePattern(
          vscode.Uri.file(path.dirname(exclude)),
          path.basename(exclude),
        ),
      ];
      for (const glob of globs) {
        const watcher = vscode.workspace.createFileSystemWatcher(glob);
        watcher.onDidCreate(() => provider.refresh());
        watcher.onDidChange(() => provider.refresh());
        watcher.onDidDelete(() => provider.refresh());
        watchers.push(watcher);
      }
    }
  };
  void rebuildWatchers();

  context.subscriptions.push(
    treeView,
    { dispose: disposeWatchers },
    treeView.onDidChangeCheckboxState(async (event) => {
      for (const [node, state] of event.items) {
        if (node.kind === 'entry') {
          await setEntryEnabled(
            node.folder.uri.fsPath,
            node.target,
            node.pattern,
            state === vscode.TreeItemCheckboxState.Checked,
          );
        }
      }
      provider.refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void rebuildWatchers();
      provider.refresh();
    }),
    vscode.commands.registerCommand('ignoreAndExclude.refreshView', () => provider.refresh()),
    vscode.commands.registerCommand(
      'ignoreAndExclude.removeEntry',
      async (node?: IgnoreNode) => {
        if (!node || node.kind !== 'entry') {
          return;
        }
        await removeEntry(node.folder.uri.fsPath, node.target, node.pattern, node.enabled);
        provider.refresh();
      },
    ),
    vscode.commands.registerCommand(
      'ignoreAndExclude.openIgnoreFile',
      async (node?: IgnoreNode) => {
        if (!node || node.kind === 'folder') {
          return;
        }
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(node.file));
        const options =
          node.kind === 'entry'
            ? { selection: new vscode.Range(node.line, 0, node.line, 0) }
            : undefined;
        await vscode.window.showTextDocument(document, options);
      },
    ),
  );

  return provider;
}
