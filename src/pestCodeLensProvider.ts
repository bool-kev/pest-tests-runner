import * as vscode from 'vscode';
import { TestResultsManager } from './testResultsManager';
import { parseTestsFromPhp, decodeTestName } from './phpAstParser';

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

		// File-level CodeLens with status
		const fileResult = this.testResultsManager.getTestResult(document.uri.fsPath, '__FILE__');
		const fileTitle = fileResult ? getTitleForStatus(fileResult, 'File') : '$(play) Run File';
		codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
			title: fileTitle,
			command: 'pest-tests-runner.runTestFile',
			arguments: []
		}));

		// Use AST parser to extract tests and describes
		const parsedTests = parseTestsFromPhp(text);

		for (const parsedTest of parsedTests) {
			const testName = decodeTestName(parsedTest.name);
			const range = new vscode.Range(parsedTest.line, 0, parsedTest.line, text.split('\n')[parsedTest.line]?.length || 0);

			if (parsedTest.type === 'describe') {
				// For describe blocks, calculate status from child tests
				const describeStatus = this.testResultsManager.getDescribeStatus(document.uri.fsPath, testName);
				const title = describeStatus ? getTitleForStatus(describeStatus) : '$(play) Run Group';
				console.log(`[CodeLensProvider] 🔍 Describe at line ${parsedTest.line + 1}: "${testName}"`);
				console.log(`  Status: ${describeStatus?.status || 'none'}, Title: ${title}`);
				codeLenses.push(new vscode.CodeLens(range, {
					title,
					command: 'pest-tests-runner.runDescribeGroup',
					arguments: [testName, parsedTest.line]
				}));
			} else {
				// For individual tests, get their stored result
				const result = this.testResultsManager.getTestResult(document.uri.fsPath, testName);
				// test or it
				const title = result ? getTitleForStatus(result) : '$(play) Run';
				console.log(`[CodeLensProvider] 🔍 Test at line ${parsedTest.line + 1}: "${testName}"`);
				console.log(`  Status: ${result?.status || 'none'}, Title: ${title}`);
				codeLenses.push(new vscode.CodeLens(range, {
					title,
					command: 'pest-tests-runner.runTest',
					arguments: [testName, parsedTest.line]
				}));
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

function getTitleForStatus(result: { status: string; duration?: number; message?: string }, label?: string): string {
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
			// Show error message instead of duration for failed tests
			const errorMsg = result.message ? `: ${result.message.substring(0, 60)}${result.message.length > 60 ? '...' : ''}` : '';
			return `❌ Failed${errorMsg}`;
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
