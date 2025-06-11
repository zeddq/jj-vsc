import * as vscode from 'vscode';

export interface JjVcsSettings {
    enableAutoFetch: boolean;
    defaultCommitMessage: string;
    showStatusBar: boolean;
}

export class SettingsManager implements vscode.Disposable {
    private _settings!: JjVcsSettings;
    private readonly _subscription: vscode.Disposable;

    constructor() {
        this.load();
        this._subscription = vscode.workspace.onDidChangeConfiguration(this.load, this);
    }

    dispose() {
        this._subscription.dispose();
    }

    get settings(): JjVcsSettings {
        return this._settings;
    }

    private load() {
        const cfg = vscode.workspace.getConfiguration('jj-vsc');
        this._settings = {
            enableAutoFetch: cfg.get<boolean>('enableAutoFetch', true),
            defaultCommitMessage: cfg.get<string>('defaultCommitMessage', ''),
            showStatusBar: cfg.get<boolean>('showStatusBar', true),
        };
    }
} 
