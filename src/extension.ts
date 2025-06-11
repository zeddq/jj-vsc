// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { JjRepository, JjExecutionError } from './domain/JjRepository';
import { JjScmProvider } from './adapters/scmProvider';
import { createJjCommitView } from './ui/commit_view';
import { NotificationService, NotificationLevel } from './services/NotificationService';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from './services/SettingsManager';

let notificationService: NotificationService;

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

	// Initialize services
	notificationService = new NotificationService();
	const settingsManager = new SettingsManager();
	const jjRepo = new JjRepository(rootPath);

	// Verify jj is installed and accessible
	try {
		await notificationService.withProgress(
			'Initializing JuJutsu extension...',
			async () => await jjRepo.verify()
		);
	} catch (err) {
		await vscode.commands.executeCommand('setContext', 'jj-vsc.isJjRepository', false);
		
		await notificationService.handleJjError(
			err,
			'Failed to initialize JuJutsu extension',
			{
				modal: true,
				actions: err instanceof JjExecutionError && err.message.includes('not installed') 
					? ['Install JuJutsu'] 
					: []
			}
		);
		
		if (err instanceof JjExecutionError && err.message.includes('not installed')) {
			const choice = await vscode.window.showErrorMessage(
				'JuJutsu (jj) is not installed or not found in PATH.',
				'Install JuJutsu',
				'Dismiss'
			);
			if (choice === 'Install JuJutsu') {
				vscode.env.openExternal(vscode.Uri.parse('https://github.com/martinvonz/jj#installation'));
			}
		}
		return;
	}

	// Repository is valid
	await vscode.commands.executeCommand('setContext', 'jj-vsc.isJjRepository', true);

	// Initialize providers
	const scmProvider = new JjScmProvider(jjRepo, notificationService);
	const commitView = createJjCommitView(jjRepo, notificationService);

	// Register content provider for original file versions
	const originalContentProvider = new JjOriginalContentProvider(jjRepo, notificationService);
	const originalProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(
		'jj-original',
		originalContentProvider
	);

	context.subscriptions.push(
		notificationService,
		settingsManager,
		scmProvider,
		commitView,
		originalProviderDisposable
	);

	// Log successful initialization
	notificationService.log(NotificationLevel.Info, 'JuJutsu VCS extension activated successfully');
	console.log('JuJutsu VCS extension active');

	// Register refresh command with error handling
	const refreshCommand = vscode.commands.registerCommand('jj-vsc.refresh', async () => {
		try {
			await notificationService.withProgress(
				'Refreshing repository...',
				async () => await scmProvider.refresh()
			);
		} catch (err) {
			// Error already handled by scmProvider
		}
	});

	// Register show diff command with error handling
	const showDiffCommand = vscode.commands.registerCommand('jj-vsc.show_diff', async () => {
		try {
			const diff = await notificationService.withProgress(
				'Loading diff...',
				async () => await jjRepo.diff()
			);
			
			if (!diff) {
				await notificationService.notify(
					NotificationLevel.Info,
					'No changes in working copy'
				);
				return;
			}
			
			const diffDoc = await vscode.workspace.openTextDocument({ 
				content: diff, 
				language: 'diff' 
			});
			await vscode.window.showTextDocument(diffDoc);
		} catch (err) {
			await notificationService.handleJjError(err, 'Failed to show diff');
		}
	});

	// Register show history command with error handling
	const showHistoryCommand = vscode.commands.registerCommand('jj-vsc.show_history', async () => {
		try {
			const history = await notificationService.withProgress(
				'Loading commit history...',
				async () => await jjRepo.log()
			);
			
			if (history.length === 0) {
				await notificationService.notify(
					NotificationLevel.Info,
					'No commit history found'
				);
				return;
			}
			
			const historyContent = history.join('\n\n');
			const historyDoc = await vscode.workspace.openTextDocument({ 
				content: historyContent, 
				language: 'markdown' 
			});
			await vscode.window.showTextDocument(historyDoc);
		} catch (err) {
			await notificationService.handleJjError(err, 'Failed to show history');
		}
	});

	// Register merge branch command with error handling
	const mergeBranchCommand = vscode.commands.registerCommand('jj-vsc.merge_branch', async () => {
		try {
			const branches = await notificationService.withProgress(
				'Loading branches...',
				async () => await jjRepo.listBranches()
			);
			
			if (branches.length === 0) {
				await notificationService.notify(
					NotificationLevel.Info,
					'No branches found'
				);
				return;
			}
			
			const branch = await vscode.window.showQuickPick(branches, { 
				placeHolder: 'Select a branch to merge',
				ignoreFocusOut: true
			});
			
			if (branch) {
				await notificationService.withProgress(
					`Merging branch ${branch}...`,
					async () => {
						await jjRepo.mergeBranch(branch);
						await scmProvider.refresh();
					}
				);
				
				await notificationService.notify(
					NotificationLevel.Info,
					`Successfully merged branch ${branch}`
				);
			}
		} catch (err) {
			await notificationService.handleJjError(err, 'Failed to merge branch');
		}
	});

	// The hello world command (can be removed in production)
	const disposable = vscode.commands.registerCommand('jj-vsc.helloWorld', () => {
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
 * Content provider for original file versions (used by SCM quick diff)
 */
class JjOriginalContentProvider implements vscode.TextDocumentContentProvider {
	constructor(
		private readonly repo: JjRepository,
		private readonly notificationService: NotificationService
	) {}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		try {
			// Extract the actual file path from the URI
			const filePath = uri.path;
			const content = await this.repo.getPreviousFileContent(filePath);
			return content;
		} catch (err) {
			this.notificationService.log(
				NotificationLevel.Error,
				`Failed to provide content for ${uri.toString()}`,
				err instanceof Error ? err.message : String(err)
			);
			// Return empty string on error to avoid breaking the diff view
			return '';
		}
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (notificationService) {
		notificationService.log(NotificationLevel.Info, 'JuJutsu VCS extension deactivated');
	}
}
