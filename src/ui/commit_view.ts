import * as vscode from 'vscode';
import { JjRepository, FileStatus } from '../domain/JjRepository';
import * as path from 'path';

/**
 * Tree item representing a file change
 */
class FileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly fileStatus: FileStatus,
        public readonly workspaceRoot: string
    ) {
        super(path.basename(fileStatus.path), vscode.TreeItemCollapsibleState.None);
        
        // Set the full path as tooltip
        this.tooltip = fileStatus.path;
        
        // Set appropriate icon based on status
        this.iconPath = this.getIconForStatus(fileStatus.status);
        
        // Store the absolute path
        this.resourceUri = vscode.Uri.file(path.isAbsolute(fileStatus.path) 
            ? fileStatus.path 
            : path.join(workspaceRoot, fileStatus.path));
        
        // Make the item clickable
        this.command = {
            command: 'jj-vsc.diffFile',
            title: 'Open Diff',
            arguments: [this]
        };
        
        // Add context value for conditional commands
        this.contextValue = `file-${fileStatus.status}`;
    }
    
    private getIconForStatus(status: FileStatus['status']): vscode.ThemeIcon {
        switch (status) {
            case 'added':
                return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
            case 'deleted':
                return new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
            case 'modified':
                return new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
            case 'moved':
                return new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('gitDecoration.renamedResourceForeground'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}

/**
 * Tree item representing a group of file changes (e.g., "Modified Files")
 */
class FileGroupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly files: FileStatus[],
        public readonly workspaceRoot: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'fileGroup';
    }
}

class JjTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private cachedStatus?: Promise<{
        modified: FileStatus[];
        added: FileStatus[];
        deleted: FileStatus[];
        moved: FileStatus[];
    }>;

    constructor(private readonly repo: JjRepository) { }

    refresh(): void {
        this.cachedStatus = undefined;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            // Root level - show file groups
            return this.getFileGroups();
        } else if (element instanceof FileGroupTreeItem) {
            // Show files in the group
            return element.files.map(file => new FileTreeItem(file, element.workspaceRoot));
        }
        
        return [];
    }

    private async getFileGroups(): Promise<vscode.TreeItem[]> {
        try {
            const status = await this.getStatus();
            const groups: vscode.TreeItem[] = [];
            const root = this.repo.rootPath;
            
            if (status.modified.length > 0) {
                groups.push(new FileGroupTreeItem(
                    `Modified (${status.modified.length})`,
                    status.modified,
                    root
                ));
            }
            
            if (status.added.length > 0) {
                groups.push(new FileGroupTreeItem(
                    `Added (${status.added.length})`,
                    status.added,
                    root
                ));
            }
            
            if (status.moved.length > 0) {
                groups.push(new FileGroupTreeItem(
                    `Moved (${status.moved.length})`,
                    status.moved,
                    root
                ));
            }
            
            if (status.deleted.length > 0) {
                groups.push(new FileGroupTreeItem(
                    `Deleted (${status.deleted.length})`,
                    status.deleted,
                    root
                ));
            }
            
            if (groups.length === 0) {
                // No changes
                const noChangesItem = new vscode.TreeItem('No changes in working copy');
                noChangesItem.iconPath = new vscode.ThemeIcon('info');
                return [noChangesItem];
            }
            
            return groups;
        } catch (error) {
            console.error('Failed to get file groups:', error);
            const errorItem = new vscode.TreeItem('Failed to load changes');
            errorItem.iconPath = new vscode.ThemeIcon('error');
            return [errorItem];
        }
    }

    private async getStatus() {
        if (!this.cachedStatus) {
            this.cachedStatus = this.repo.status().catch(err => {
                console.error('Failed to get repository status:', err);
                // Return empty status on error
                return {
                    modified: [],
                    added: [],
                    deleted: [],
                    moved: []
                };
            });
        }
        return this.cachedStatus;
    }
}

export function createJjCommitView(repo: JjRepository) {
    const treeDataProvider = new JjTreeDataProvider(repo);
    const view = vscode.window.createTreeView('jj-commit-log', { 
        treeDataProvider,
        showCollapseAll: true
    });

    const commands = [
        vscode.commands.registerCommand('jj-vsc.diffFile', async (item: FileTreeItem) => {
            if (!(item instanceof FileTreeItem)) {
                return;
            }

            const fileUri = item.resourceUri;
            const fileName = path.basename(item.fileStatus.path);
            
            try {
                if (item.fileStatus.status === 'deleted') {
                    // For deleted files, show the previous version only
                    const previousContent = await getPreviousFileContent(repo, item.fileStatus.path);
                    const previousUri = vscode.Uri.parse(`jj-previous:${fileUri?.path}`);
                    
                    // Register a content provider for the previous version
                    const provider = new JjPreviousContentProvider();
                    provider.setContent(previousUri.path, previousContent);
                    const disposable = vscode.workspace.registerTextDocumentContentProvider('jj-previous', provider);
                    
                    await vscode.commands.executeCommand(
                        'vscode.open',
                        previousUri,
                        { preview: true, viewColumn: vscode.ViewColumn.Active },
                        `${fileName} (deleted)`
                    );
                    
                    // Clean up after a delay
                    setTimeout(() => disposable.dispose(), 60000);
                } else if (item.fileStatus.status === 'added') {
                    // For added files, just open the file
                    await vscode.commands.executeCommand('vscode.open', fileUri);
                } else {
                    // For modified/moved files, show diff
                    const previousContent = await getPreviousFileContent(repo, item.fileStatus.path);
                    const previousUri = vscode.Uri.parse(`jj-previous:${fileUri?.path}`);
                    
                    // Register a content provider for the previous version
                    const provider = new JjPreviousContentProvider();
                    provider.setContent(previousUri.path, previousContent);
                    const disposable = vscode.workspace.registerTextDocumentContentProvider('jj-previous', provider);
                    
                    const title = `${fileName} (Working Copy ↔ Previous)`;
                    await vscode.commands.executeCommand(
                        'vscode.diff',
                        previousUri,
                        fileUri,
                        title,
                        { preview: true, viewColumn: vscode.ViewColumn.Active }
                    );
                    
                    // Clean up after a delay
                    setTimeout(() => disposable.dispose(), 60000);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to show diff for ${fileName}: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('jj-vsc.show_diff', async () => {
            console.log('show_diff');
            const diff = await repo.diff();
            const diffDoc = await vscode.workspace.openTextDocument({ content: diff, language: 'diff' });
            await vscode.window.showTextDocument(diffDoc);
        }),
        
        vscode.commands.registerCommand('jj-vsc.refresh', async () => {
            console.log('refresh');
            treeDataProvider.refresh();
            // Optionally refresh the SCM provider too
            await vscode.commands.executeCommand('workbench.scm.refresh');
        }),
        
        vscode.commands.registerCommand('jj-vsc.merge_branch', async () => {
            console.log('merge_branch');
            const branches = await repo.listBranches();
            const branch = await vscode.window.showQuickPick(branches, { placeHolder: 'Select a branch to merge' });
            if (branch) {
                await repo.mergeBranch(branch);
                vscode.window.showInformationMessage(`Merged branch ${branch}.`);
                treeDataProvider.refresh();
            }
        })
    ];

    // Auto-refresh when files change
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    const refreshDebounced = debounce(() => treeDataProvider.refresh(), 1000);
    
    fileWatcher.onDidChange(refreshDebounced);
    fileWatcher.onDidCreate(refreshDebounced);
    fileWatcher.onDidDelete(refreshDebounced);

    return vscode.Disposable.from(...commands, view, fileWatcher);
}

/**
 * Content provider for showing previous file versions
 */
class JjPreviousContentProvider implements vscode.TextDocumentContentProvider {
    private contents = new Map<string, string>();
    
    setContent(path: string, content: string): void {
        this.contents.set(path, content);
    }
    
    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.path) || '';
    }
}

/**
 * Get the previous version of a file from jj
 */
async function getPreviousFileContent(repo: JjRepository, filePath: string): Promise<string> {
    return await repo.getPreviousFileContent(filePath);
}

/**
 * Simple debounce utility
 */
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
    let timeout: NodeJS.Timeout | undefined;
    return ((...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    }) as T;
}
