// src/adapters/scmProvider.ts
import * as vscode from 'vscode';
import { JjRepository, JjExecutionError } from '../domain/JjRepository';
import { toResourceState } from './resourceState';
import { NotificationService, NotificationLevel } from '../services/NotificationService';

export class JjScmProvider implements vscode.Disposable {
  private readonly sourceControl =
    vscode.scm.createSourceControl('jj', 'JuJutsu');

  private readonly workingTree =
    this.sourceControl.createResourceGroup('working', 'Changes');

  private disposables: vscode.Disposable[] = [];
  private refreshing = false;
  private autoRefreshEnabled = true;
  private lastRefreshError?: Error;

  constructor(
    private readonly repo: JjRepository,
    private readonly notificationService: NotificationService
  ) {
    // Bind commit command to the SCM input box accept action
    this.sourceControl.acceptInputCommand = { command: 'jj-vsc.commit', title: 'Commit' };

    // Configure source control UI
    this.sourceControl.quickDiffProvider = this;
    this.sourceControl.count = 0;

    this.disposables.push(
      vscode.commands.registerCommand('jj-vsc.commit', async () => {
        const message = this.sourceControl.inputBox.value.trim();
        
        if (!message) {
          await this.notificationService.notify(
            NotificationLevel.Warning,
            'Please enter a commit message',
            { modal: true }
          );
          return;
        }

        try {
          await this.commit(message);
          this.sourceControl.inputBox.value = '';
        } catch (err) {
          // Error is handled in commit method
        }
      }),
      
      vscode.commands.registerCommand('jj-vsc.toggleAutoRefresh', () => {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;
        const status = this.autoRefreshEnabled ? 'enabled' : 'disabled';
        this.notificationService.notify(
          NotificationLevel.Info,
          `Auto-refresh ${status}`
        );
      }),
      
      vscode.workspace.onDidSaveTextDocument(() => {
        if (!this.autoRefreshEnabled) return;
        
        // Debounce refresh on save to avoid multiple rapid refreshes
        if (!this.refreshing) {
          void this.refresh(true).catch(err => {
            // Auto-refresh errors are logged but not shown to user
            this.notificationService.log(
              NotificationLevel.Warning,
              'Auto-refresh failed',
              err instanceof Error ? err.message : String(err)
            );
          });
        }
      })
    );

    void this.refresh().catch(err => {
      this.notificationService.handleJjError(
        err,
        'Failed to initialize repository',
        { modal: true }
      );
    });
  }

  async refresh(isAutoRefresh = false): Promise<void> {
    if (this.refreshing) {
      return; // Avoid concurrent refreshes
    }

    this.refreshing = true;
    try {
      const status = await this.repo.status();
      const root = this.repo.rootPath;
      
      // Clear and rebuild resource states
      const resourceStates: vscode.SourceControlResourceState[] = [];
      
      // Process each file type
      for (const file of status.modified) {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          this.notificationService.log(
            NotificationLevel.Warning,
            `Failed to create resource state for ${file.path}`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      
      for (const file of status.added) {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          this.notificationService.log(
            NotificationLevel.Warning,
            `Failed to create resource state for ${file.path}`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      
      for (const file of status.deleted) {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          this.notificationService.log(
            NotificationLevel.Warning,
            `Failed to create resource state for ${file.path}`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      
      for (const file of status.moved) {
        try {
          resourceStates.push(toResourceState(root, file));
        } catch (err) {
          this.notificationService.log(
            NotificationLevel.Warning,
            `Failed to create resource state for ${file.path}`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      this.workingTree.resourceStates = resourceStates;
      
      // Update change count
      const changeCount = resourceStates.length;
      this.sourceControl.count = changeCount;
      
      // Update status bar with change count
      this.sourceControl.statusBarCommands = changeCount > 0 
        ? [{
            command: 'jj-vsc.show_diff',
            title: `$(git-commit) ${changeCount} change${changeCount === 1 ? '' : 's'}`,
            tooltip: 'Show working copy diff'
          }]
        : undefined;

      // Clear any previous refresh errors on successful refresh
      if (this.lastRefreshError) {
        this.lastRefreshError = undefined;
        this.notificationService.clearErrors();
        
        // Show success message if we recovered from error
        if (!isAutoRefresh) {
          await this.notificationService.notify(
            NotificationLevel.Info,
            'Repository status refreshed successfully'
          );
        }
      }

    } catch (err) {
      this.lastRefreshError = err instanceof Error ? err : new Error(String(err));
      
      // Clear the resource states to indicate error state
      this.workingTree.resourceStates = [];
      this.sourceControl.count = 0;
      
      // Update status bar to show error
      this.sourceControl.statusBarCommands = [{
        command: 'jj-vsc.refresh',
        title: '$(error) Repository error',
        tooltip: `Failed to get status: ${this.lastRefreshError.message}\nClick to retry`
      }];
      
      // Show error to user (not for auto-refresh)
      if (!isAutoRefresh) {
        await this.notificationService.handleJjError(
          err,
          'Failed to refresh repository status',
          {
            actions: ['Retry', 'Disable Auto-refresh']
          }
        ).then(async () => {
          const action = await vscode.window.showErrorMessage(
            'Failed to refresh repository status',
            'Retry',
            'Disable Auto-refresh'
          );
          
          if (action === 'Retry') {
            void this.refresh();
          } else if (action === 'Disable Auto-refresh') {
            this.autoRefreshEnabled = false;
          }
        });
      }
      
      throw err;
    } finally {
      this.refreshing = false;
    }
  }

  async commit(message: string): Promise<void> {
    try {
      await this.notificationService.withProgress(
        'Committing changes...',
        async () => {
          await this.repo.commit(message);
        }
      );
      
      await this.notificationService.notify(
        NotificationLevel.Info,
        'Changes committed successfully'
      );
    } catch (err) {
      await this.notificationService.handleJjError(
        err,
        'Failed to commit',
        { modal: true }
      );
      throw err; // Re-throw to let caller know commit failed
    } finally {
      // Always refresh after commit attempt
      await this.refresh().catch(err => {
        this.notificationService.log(
          NotificationLevel.Warning,
          'Post-commit refresh failed',
          err instanceof Error ? err.message : String(err)
        );
      });
    }
  }

  /**
   * Provide quick diff content (for gutter indicators)
   */
  async provideOriginalResource?(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): Promise<vscode.Uri | null> {
    try {
      // Check if file exists in working tree changes
      const isTracked = this.workingTree.resourceStates.some(
        state => state.resourceUri.toString() === uri.toString()
      );
      
      if (!isTracked) {
        return null;
      }
      
      // Return a URI that will be handled by our content provider
      return uri.with({ scheme: 'jj-original', query: 'rev=@-' });
    } catch (err) {
      this.notificationService.log(
        NotificationLevel.Warning,
        `Failed to provide original resource for ${uri.fsPath}`,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.sourceControl.dispose();
  }
}
