import * as vscode from 'vscode';
import { JjRepository } from '../domain/JjRepository';

class JjTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _onDidUpdateHistory = new vscode.EventEmitter<vscode.TreeItem[]>();
    readonly onDidUpdateHistory: vscode.Event<vscode.TreeItem[]> = this._onDidUpdateHistory.event;

    private cachedHistory?: Promise<vscode.TreeItem[]>;

    constructor(private readonly repo: JjRepository) { }

    refresh(): void {
        this.cachedHistory = undefined;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        if (this.cachedHistory) {
            return this.cachedHistory;
        }

        const historyPromise = this.repo.log().then(log => log.map(item => new vscode.TreeItem(item)));
        this.cachedHistory = historyPromise;

        historyPromise.then((history: vscode.TreeItem[]) => {
            this._onDidUpdateHistory.fire(history);
        });

        return this.cachedHistory;
    }
}

export function createJjCommitView(repo: JjRepository) {
    const treeDataProvider = new JjTreeDataProvider(repo);
    const view = vscode.window.createTreeView('jj-commit-log', { treeDataProvider });

    const commands = [
        vscode.commands.registerCommand('jj-vsc.show_diff', async () => {
            console.log('show_diff');
            const diff = await repo.diff();
            const diffDoc = await vscode.workspace.openTextDocument({ content: diff, language: 'diff' });
            await vscode.window.showTextDocument(diffDoc);
        }),
        vscode.commands.registerCommand('jj-vsc.refresh', async () => {
            console.log('refresh');
            const historyUpdated = new Promise<vscode.TreeItem[]>(resolve => {
                const listener = treeDataProvider.onDidUpdateHistory((history: vscode.TreeItem[]) => {
                    listener.dispose();
                    resolve(history);
                });
            });

            treeDataProvider.refresh();

            // After refreshing, reveal the latest commit at the top of the list (if available)
            const children = await historyUpdated;
            if (children.length > 0) {
                await view.reveal(children[0], { focus: true });
            }
        }),
        vscode.commands.registerCommand('jj-vsc.merge_branch', async () => {
            console.log('merge_branch');
            const branches = await repo.listBranches();
            const branch = await vscode.window.showQuickPick(branches, { placeHolder: 'Select a branch to merge' });
            if (branch) {
                await repo.mergeBranch(branch);
                vscode.window.showInformationMessage(`Merged branch ${branch}.`);
            }
        })
    ];

    return vscode.Disposable.from(...commands, view);
} 