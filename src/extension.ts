// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { JjRepository } from './domain/JjRepository';
import { JjScmProvider } from './adapters/scmProvider';
import { createJjCommitView } from './ui/commit_view';
import * as fs from 'fs';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!rootPath) {
		vscode.window.showErrorMessage("No workspace folder found.");
		return;
	}

	const jjPath = path.join(rootPath, '.jj');
	if (!fs.existsSync(jjPath)) {
		// Not a jj repository.
		vscode.commands.executeCommand('setContext', 'jj-vsc.isJjRepository', false);
		return;
	}
	vscode.commands.executeCommand('setContext', 'jj-vsc.isJjRepository', true);

	const jjRepo = new JjRepository(rootPath);
	const scmProvider = new JjScmProvider(jjRepo);
	const commitView = createJjCommitView(jjRepo);

	context.subscriptions.push(scmProvider, commitView);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('JuJutsu VCS extension active');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('jj-vsc.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from jj-vsc!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
