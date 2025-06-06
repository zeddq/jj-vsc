// src/adapters/scmProvider.ts
import * as vscode from 'vscode';
import { JjRepository } from '../domain/JjRepository';
import { toResourceState } from './toResourceState';

export class JjScmProvider implements vscode.Disposable {
    private readonly sourceControl =
      vscode.scm.createSourceControl('jj', 'JuJutsu');
  
    private readonly workingTree =
      this.sourceControl.createResourceGroup('working', 'Changes');
  
    private readonly staged =
      this.sourceControl.createResourceGroup('staged', 'Staged');
  
    private disposables: vscode.Disposable[] = [];
  
    constructor(private readonly repo: JjRepository) {
      // Bind commit command to the SCM input box accept action
      this.sourceControl.acceptInputCommand = { command: 'jj-vsc.commit', title: 'Commit' };

      this.disposables.push(
        vscode.commands.registerCommand('jj-vsc.commit', async () => {
          await this.commit(this.sourceControl.inputBox.value);
          this.sourceControl.inputBox.value = '';
        }),
        vscode.workspace.onDidSaveTextDocument(() => this.refresh())
      );

      void this.refresh();
    }
  
    async refresh() {
      const status = await this.repo.status();       // domain layer
      this.workingTree.resourceStates = status.modified.map(toResourceState);
      this.staged.resourceStates      = status.added.map(toResourceState);
    }
  
    async commit(message: string) {
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.SourceControl, title: 'Committing' },
          () => this.repo.commit(message));
      } finally {
        await this.refresh();
      }
    }
  
    dispose() { this.disposables.forEach(d => d.dispose()); }
  }