// src/adapters/scmProvider.ts
import * as vscode from 'vscode';
import { JjRepository, JjExecutionError, execJj } from '../domain/JjRepository';
import { toResourceState } from './resourceState';

export class JjScmProvider implements vscode.Disposable {
  private readonly sourceControl =
    vscode.scm.createSourceControl('jj', 'JuJutsu');

  private readonly workingTree =
    this.sourceControl.createResourceGroup('working', 'Changes');

  private disposables: vscode.Disposable[] = [];
  private refreshing = false;

  constructor(private readonly repo: JjRepository) {
    // Bind commit command to the SCM input box accept action
    this.sourceControl.acceptInputCommand = { command: 'jj-vsc.commit', title: 'Commit' };

    this.disposables.push(
      vscode.commands.registerCommand('jj-vsc.commit', async () => {
        const message = this.sourceControl.inputBox.value.trim();
        
        if (!message) {
          vscode.window.showWarningMessage('Please enter a commit message');
          return;
        }

        try {
          await this.commit(message);
          this.sourceControl.inputBox.value = '';
        } catch (err) {
          // Error is handled in commit method
        }
      }),
      vscode.workspace.onDidSaveTextDocument(() => {
        // Debounce refresh on save to avoid multiple rapid refreshes
        if (!this.refreshing) {
          void this.refresh().catch(err => {
            // Log but don't show error on auto-refresh to avoid spam
            console.error('Auto-refresh failed:', err);
          });
        }
      })
    );

    void this.refresh().catch(err => {
      console.error('Initial refresh failed:', err);
      vscode.window.showWarningMessage('Failed to load repository status');
    });
  }

  async refresh(): Promise<void> {
    if (this.refreshing) {
      return; // Avoid concurrent refreshes
    }

    this.refreshing = true;
    try {
      const status = await this.repo.status();
      const root = this.repo.rootPath;
      
      // Clear and rebuild resource states
      const resourceStates: vscode.SourceControlResourceState[] = [];
      
      status.modified.forEach(file => {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          console.error(`Failed to create resource state for ${file.path}:`, err);
        }
      });
      
      status.added.forEach(file => {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          console.error(`Failed to create resource state for ${file.path}:`, err);
        }
      });
      
      status.deleted.forEach(file => {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          console.error(`Failed to create resource state for ${file.path}:`, err);
        }
      });
      
      status.moved.forEach(file => {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          console.error(`Failed to create resource state for ${file.path}:`, err);
        }
      });

      this.workingTree.resourceStates = resourceStates;
      
      // Update status bar with change count
      const changeCount = resourceStates.length;
      this.sourceControl.statusBarCommands = changeCount > 0 
        ? [{
            command: 'jj-vsc.show_diff',
            title: `$(git-commit) ${changeCount} change${changeCount === 1 ? '' : 's'}`,
            tooltip: 'Show working copy diff'
          }]
        : undefined;

    } catch (err) {
      if (err instanceof JjExecutionError) {
        // Don't show error dialog for every refresh failure
        console.error('Failed to refresh repository status:', err.message);
        
        // Clear the resource states to indicate error state
        this.workingTree.resourceStates = [];
        
        // Update status bar to show error
        this.sourceControl.statusBarCommands = [{
          command: 'jj-vsc.refresh',
          title: '$(error) Repository error',
          tooltip: `Failed to get status: ${err.message}\nClick to retry`
        }];
      } else {
        throw err;
      }
    } finally {
      this.refreshing = false;
    }
  }

  async commit(message: string): Promise<void> {
    try {
      await vscode.window.withProgress(
        { 
          location: vscode.ProgressLocation.SourceControl, 
          title: 'Committing changes...',
          cancellable: false
        },
        async () => {
          await this.repo.commit(message);
        }
      );
      
      vscode.window.showInformationMessage('Changes committed successfully');
    } catch (err) {
      if (err instanceof JjExecutionError) {
        vscode.window.showErrorMessage(`Failed to commit: ${err.message}`);
        
        // Log detailed error for debugging
        console.error('Commit failed:', err);
        if (err.stderr) {
          console.error('stderr:', err.stderr);
        }
      } else if (err instanceof Error) {
        vscode.window.showErrorMessage(`Failed to commit: ${err.message}`);
      } else {
        vscode.window.showErrorMessage('Failed to commit changes');
      }
      throw err; // Re-throw to let caller know commit failed
    } finally {
      // Always refresh after commit attempt
      await this.refresh().catch(err => {
        console.error('Post-commit refresh failed:', err);
      });
    }
  }

  /**
 * Get the previous version of a file content
 * TODO: Implement with the correct jj command when provided
 * 
 * @param filePath Path to the file relative to repository root
 * @returns The content of the file in the previous revision
 */
  async getPreviousFileContent(filePath: string): Promise<string> {
    return await execJj(['cat', '-r', '@-', filePath], { cwd: this.repo.rootPath });
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.sourceControl.dispose();
  }
}
