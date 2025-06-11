// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { JjRepository, JjExecutionError } from './domain/JjRepository';
import { JjScmProvider } from './adapters/scmProvider';
import { createJjCommitView } from './ui/commit_view';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from './services/SettingsManager';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!rootPath) {
		vscode.window.showErrorMessage("No workspace folder found.");
		return;
	}

	const jjPath = path.join(rootPath, '.jj');
	if (!fs.existsSync(jjPath)) {
		// Not a jj repository.
		await vscode.commands.executeCommand('setContext', 'jj-vsc.isJjRepository', false);
		return;
	}

	const settingsManager = new SettingsManager();
	const jjRepo = new JjRepository(rootPath);

	// Verify jj is installed and accessible
	try {
		await jjRepo.verify();
	} catch (err) {
		await vscode.commands.executeCommand('setContext', 'jj-vsc.isJjRepository', false);
		
		if (err instanceof JjExecutionError) {
			if (err.message.includes('not installed')) {
				const choice = await vscode.window.showErrorMessage(
					'JuJutsu (jj) is not installed or not found in PATH. Please install jj to use this extension.',
					'Learn More'
				);
				if (choice === 'Learn More') {
					vscode.env.openExternal(vscode.Uri.parse('https://github.com/martinvonz/jj'));
				}
			} else {
				vscode.window.showErrorMessage(`JuJutsu Error: ${err.message}`);
			}
		} else {
			vscode.window.showErrorMessage('Failed to initialize JuJutsu extension');
		}
		return;
	}

	// Repository is valid
	await vscode.commands.executeCommand('setContext', 'jj-vsc.isJjRepository', true);

	const scmProvider = new JjScmProvider(jjRepo);
	const commitView = createJjCommitView(jjRepo);

	context.subscriptions.push(settingsManager, scmProvider, commitView);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('JuJutsu VCS extension active');

	// Register refresh command with error handling
	const refreshCommand = vscode.commands.registerCommand('jj-vsc.refresh', async () => {
		try {
			await scmProvider.refresh();
		} catch (err) {
			handleJjError(err, 'Failed to refresh repository status');
		}
	});

	// Register show diff command with error handling
	const showDiffCommand = vscode.commands.registerCommand('jj-vsc.show_diff', async () => {
		try {
			const diff = await jjRepo.diff();
			if (!diff) {
				vscode.window.showInformationMessage('No changes in working copy');
				return;
			}
			const diffDoc = await vscode.workspace.openTextDocument({ content: diff, language: 'diff' });
			await vscode.window.showTextDocument(diffDoc);
		} catch (err) {
			handleJjError(err, 'Failed to show diff');
		}
	});

	// Register show history command with error handling
	const showHistoryCommand = vscode.commands.registerCommand('jj-vsc.show_history', async () => {
		try {
			const history = await jjRepo.log();
			if (history.length === 0) {
				vscode.window.showInformationMessage('No commit history found');
				return;
			}
			const historyContent = history.join('\n\n');
			const historyDoc = await vscode.workspace.openTextDocument({ content: historyContent, language: 'markdown' });
			await vscode.window.showTextDocument(historyDoc);
		} catch (err) {
			handleJjError(err, 'Failed to show history');
		}
	});

	// Register merge branch command with error handling
	const mergeBranchCommand = vscode.commands.registerCommand('jj-vsc.merge_branch', async () => {
		try {
			const branches = await jjRepo.listBranches();
			if (branches.length === 0) {
				vscode.window.showInformationMessage('No branches found');
				return;
			}
			
			const branch = await vscode.window.showQuickPick(branches, { 
				placeHolder: 'Select a branch to merge',
				ignoreFocusOut: true
			});
			
			if (branch) {
				await vscode.window.withProgress(
					{ 
						location: vscode.ProgressLocation.Notification, 
						title: `Merging branch ${branch}...`,
						cancellable: false
					},
					async () => {
						await jjRepo.mergeBranch(branch);
						await scmProvider.refresh();
					}
				);
				vscode.window.showInformationMessage(`Successfully merged branch ${branch}`);
			}
		} catch (err) {
			handleJjError(err, 'Failed to merge branch');
		}
	});

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('jj-vsc.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from jj-vsc!');
	});

	context.subscriptions.push(
		disposable,
		refreshCommand,
		showDiffCommand,
		showHistoryCommand,
		mergeBranchCommand
	);
}

/**
 * Handle JJ execution errors with appropriate error messages
 */
function handleJjError(err: unknown, defaultMessage: string): void {
	if (err instanceof JjExecutionError) {
		// Show user-friendly error messages
		const actions: string[] = [];
		
		// Add relevant actions based on error type
		if (err.message.includes('Concurrent modification')) {
			actions.push('Refresh');
		}
		
		vscode.window.showErrorMessage(
			`JuJutsu: ${err.message}`,
			...actions
		).then(action => {
			if (action === 'Refresh') {
				vscode.commands.executeCommand('jj-vsc.refresh');
			}
		});

		// Log detailed error information to console for debugging
		console.error(`JJ Command Failed: ${err.command} ${err.args.join(' ')}`);
		if (err.stderr) {
			console.error(`stderr: ${err.stderr}`);
		}
		if (err.exitCode !== undefined) {
			console.error(`Exit code: ${err.exitCode}`);
		}
		if (err.originalError) {
			console.error('Original error:', err.originalError);
		}
	} else if (err instanceof Error) {
		vscode.window.showErrorMessage(`${defaultMessage}: ${err.message}`);
		console.error(defaultMessage, err);
	} else {
		vscode.window.showErrorMessage(defaultMessage);
		console.error(defaultMessage, err);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
