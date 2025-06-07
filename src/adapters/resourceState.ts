import * as vscode from 'vscode';
import { FileStatus } from '../domain/JjRepository';

export function toResourceState(file: FileStatus): vscode.SourceControlResourceState {
    return {
        resourceUri: vscode.Uri.file(file.path),
        decorations: {
            tooltip: file.status,
        },
    };
} 