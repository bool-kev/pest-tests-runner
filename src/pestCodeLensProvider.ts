import * as vscode from 'vscode';
import { TestResultsManager } from './testResultsManager';

export class PestCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

	constructor(private testResultsManager: TestResultsManager) {
		vscode.workspace.onDidChangeConfiguration(() => this._onDidChangeCodeLenses.fire());
	}

	public refresh(): void {
		console.log('[CodeLensProvider] 🔄 Refresh triggered');
		this._onDidChangeCodeLenses.fire();
	}

	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const config = vscode.workspace.getConfiguration('pest-tests-runner');
		if (!config.get<boolean>('enableCodeLens', true)) {
			return [];
		}
		if (!this.isPestTestFile(document)) {
			return [];
		}

		const codeLenses: vscode.CodeLens[] = [];
		const text = document.getText();
		const lines = text.split('\n');

		// File-level CodeLens with status
		const fileResult = this.testResultsManager.getTestResult(document.uri.fsPath, '__FILE__');
		const fileTitle = fileResult ? getTitleForStatus(fileResult, 'File') : '$(play) Run File';
		codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
			title: fileTitle,
			command: 'pest-tests-runner.runTestFile',
			arguments: []
		}));

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			// Match test names with proper quote handling:
			// - Capture the opening quote type (', ", or `)
			// - Match everything until the same closing quote (allowing escaped quotes)
			// - Support apostrophes, backslashes, and special characters in test names
			const testMatch = line.match(/^\s*(test|it)\s*\(\s*(['"`])((?:(?!\2).|\\.)*)\2/);
			const describeMatch = line.match(/^\s*describe\s*\(\s*(['"`])((?:(?!\1).|\\.)*)\1/);

			if (testMatch) {
				const testName = testMatch[3]; // The captured test name
				const range = new vscode.Range(i, 0, i, line.length);
				const result = this.testResultsManager.getTestResult(document.uri.fsPath, testName);
				const title = result ? getTitleForStatus(result) : '$(play) Run';

				console.log(`[CodeLensProvider] 🔍 Test at line ${i + 1}: "${testName}"`);
				console.log(`  Status: ${result?.status || 'none'}, Title: ${title}`);

				codeLenses.push(new vscode.CodeLens(range, { title, command: 'pest-tests-runner.runTest', arguments: [testName, i] }));
			} else if (describeMatch) {
				const describeName = describeMatch[2]; // The captured describe name
				const range = new vscode.Range(i, 0, i, line.length);
				const result = this.testResultsManager.getTestResult(document.uri.fsPath, describeName);
				const title = result ? getTitleForStatus(result) : '$(play) Run Group';

				console.log(`[CodeLensProvider] 🔍 Describe at line ${i + 1}: "${describeName}"`);
				console.log(`  Status: ${result?.status || 'none'}, Title: ${title}`);

				codeLenses.push(new vscode.CodeLens(range, { title, command: 'pest-tests-runner.runDescribeGroup', arguments: [describeName, i] }));
			}
		}

		return codeLenses;
	}

	private isPestTestFile(document: vscode.TextDocument): boolean {
		const filePath = document.uri.fsPath.toLowerCase();
		return (
			document.languageId === 'php' &&
			(filePath.includes('/tests/') || filePath.includes('\\tests\\') || filePath.endsWith('test.php'))
		);
	}
}

function getTitleForStatus(result: { status: string; duration?: number }, label?: string): string {
	const defaultLabel = label || 'Run';

	// Format duration: show more precision for very fast tests (< 0.01s)
	const formatDuration = (duration: number): string => {
		if (duration < 0.01) {
			// For very fast tests, show up to 4 decimal places
			return `${duration.toFixed(4)}s`;
		}
		return `${duration.toFixed(2)}s`;
	};

	switch (result.status) {
		case 'passed':
			// Use green circle emoji for visual color feedback
			return `✅ Passed${result.duration !== undefined ? ` (${formatDuration(result.duration)})` : ''}`;
		case 'failed':
			// Use red X emoji for visual color feedback
			return `❌ Failed${result.duration !== undefined ? ` (${formatDuration(result.duration)})` : ''}`;
		case 'running':
			// Use hourglass emoji for running state
			return `⏳ Running${label ? ` ${label}` : ''}...`;
		case 'skipped':
			// Use yellow circle emoji - more visible than ⊘
			return `🟡 Skipped${result.duration !== undefined ? ` (${formatDuration(result.duration)})` : ''}`;
		default:
			return `$(play) ${defaultLabel}`;
	}
}
