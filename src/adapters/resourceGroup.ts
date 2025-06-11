import * as vscode from 'vscode';

/**
 * Minimal in-memory implementation of a {@link vscode.SourceControlResourceGroup}
 * to satisfy the TypeScript compiler for tests.
 * It is **not** used at runtime – the real API returns concrete groups via
 * {@link vscode.scm.createResourceGroup}. Keeping it lightweight avoids having
 * to bring in the actual VS Code extension host during unit testing.
 */
export class JjResourceGroup implements vscode.SourceControlResourceGroup {
    readonly id: string;

    private _label = 'Jj';
    private _resourceStates: vscode.SourceControlResourceState[] = [];

    constructor(id = 'jj') {
        this.id = id;
    }

    get label(): string {
        return this._label;
    }
    set label(value: string) {
        this._label = value;
    }

    get resourceStates(): vscode.SourceControlResourceState[] {
        return this._resourceStates;
    }
    set resourceStates(states: vscode.SourceControlResourceState[]) {
        this._resourceStates = [...states];
    }

    dispose(): void {
        // Nothing to clean up in this stub implementation.
    }
}
