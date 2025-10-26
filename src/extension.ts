import * as vscode from 'vscode';
import { PestCodeLensProvider } from './pestCodeLensProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Pest Runner Icons is now active!');

	// Register CodeLens provider for PHP files
	const codeLensProvider = new PestCodeLensProvider();
	const codeLensDisposable = vscode.languages.registerCodeLensProvider(
		{ language: 'php', scheme: 'file' },
		codeLensProvider
	);

	// Register commands
	const runTestCommand = vscode.commands.registerCommand(
		'pest-runner-icons.runTest',
		async (testName: string, line: number) => {
			await runTest(testName, line);
		}
	);

	const runTestFileCommand = vscode.commands.registerCommand(
		'pest-runner-icons.runTestFile',
		async () => {
			await runTestFile();
		}
	);

	const runTestSuiteCommand = vscode.commands.registerCommand(
		'pest-runner-icons.runTestSuite',
		async () => {
			await runTestSuite();
		}
	);

	const runDescribeGroupCommand = vscode.commands.registerCommand(
		'pest-runner-icons.runDescribeGroup',
		async (groupName: string, line: number) => {
			await runDescribeGroup(groupName, line);
		}
	);

	context.subscriptions.push(
		codeLensDisposable,
		runTestCommand,
		runTestFileCommand,
		runTestSuiteCommand,
		runDescribeGroupCommand
	);
}

async function runTest(testName: string, line: number) {
	const config = vscode.workspace.getConfiguration('pest-runner-icons');
	const useBetterPest = config.get<boolean>('useBetterPest', true);

	if (useBetterPest) {
		// Check if Better Pest extension is installed
		const betterPestExtension = vscode.extensions.getExtension('m1guelpf.better-pest');
		if (betterPestExtension) {
			// Position cursor at the test line and run Better Pest command
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const position = new vscode.Position(line, 0);
				editor.selection = new vscode.Selection(position, position);
				await vscode.commands.executeCommand('better-pest.run');
				return;
			}
		}
	}

	// Fallback to built-in execution
	await executeTestCommand(testName, false, false);
}

async function runDescribeGroup(groupName: string, line: number) {
	// For describe groups, always use the filter approach
	// Better Pest doesn't detect describe groups by cursor position
	await executeTestCommand(groupName, false, false);
}

async function runTestFile() {
	const config = vscode.workspace.getConfiguration('pest-runner-icons');
	const useBetterPest = config.get<boolean>('useBetterPest', true);

	if (useBetterPest) {
		const betterPestExtension = vscode.extensions.getExtension('m1guelpf.better-pest');
		if (betterPestExtension) {
			await vscode.commands.executeCommand('better-pest.run-file');
			return;
		}
	}

	// Fallback to built-in execution
	await executeTestCommand('', true, false);
}

async function runTestSuite() {
	const config = vscode.workspace.getConfiguration('pest-runner-icons');
	const useBetterPest = config.get<boolean>('useBetterPest', true);

	if (useBetterPest) {
		const betterPestExtension = vscode.extensions.getExtension('m1guelpf.better-pest');
		if (betterPestExtension) {
			await vscode.commands.executeCommand('better-pest.run-suite');
			return;
		}
	}

	// Fallback to built-in execution
	await executeTestCommand('', false, true);
}

async function executeTestCommand(testName: string, runFile: boolean, runSuite: boolean) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor');
		return;
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace folder found');
		return;
	}

	const filePath = editor.document.uri.fsPath;
	const pestBinary = './vendor/bin/pest';

	let command = '';
	if (runSuite) {
		command = pestBinary;
	} else if (runFile) {
		command = `${pestBinary} "${filePath}"`;
	} else if (testName) {
		// Both describe groups and individual tests use the same filter format
		// Pest matches by test name without regex delimiters
		command = `${pestBinary} "${filePath}" --filter "${testName}"`;
	}

	// Execute in terminal
	const terminal = vscode.window.createTerminal({
		name: 'Pest Test Runner',
		cwd: workspaceFolder.uri.fsPath
	});
	terminal.show();
	terminal.sendText(command);
}

export function deactivate() { }
