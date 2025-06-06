import * as vscode from 'vscode';

export interface JjVcsSettings {
    enableAutoFetch: boolean;
    defaultCommitMessage: string;
    showStatusBar: boolean;
}

export class SettingsManager {
    private _settings!: JjVcsSettings;

    constructor() {
        this.load();
        vscode.workspace.onDidChangeConfiguration(this.load, this);
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