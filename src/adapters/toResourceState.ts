import * as vscode from 'vscode';
import * as path from 'path';
import { FileStatus } from '../domain/JjRepository';

export function toResourceState(file: FileStatus, root: string): vscode.SourceControlResourceState {
    const absolutePath = path.isAbsolute(file.path)
        ? file.path
        : path.join(root, file.path);
    return {
        resourceUri: vscode.Uri.file(absolutePath),
        decorations: {
            tooltip: file.status,
        },
    };
}
