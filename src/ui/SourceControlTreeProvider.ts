import * as vscode from 'vscode';

export class SourceControlItem extends vscode.TreeItem {
    constructor(label: string, resourceUri?: vscode.Uri, collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None) {
        super(label, collapsibleState);
        this.resourceUri = resourceUri;
    }
}

export class SourceControlTreeProvider implements vscode.TreeDataProvider<SourceControlItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SourceControlItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SourceControlItem | undefined | null | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: SourceControlItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: SourceControlItem): vscode.ProviderResult<SourceControlItem[]> {
        // TODO: Provide real data once available
        return [];
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
} 