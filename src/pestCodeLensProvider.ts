import * as vscode from 'vscode';
import { TestResultsManager, FILE_RESULT_KEY } from './testResultsManager';
import { decodeTestName } from './phpAstParser';
import { formatDuration } from './utils/testResultTypes';
import { parsePhpCached } from './utils/astWorker';

export class PestCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

	constructor(private testResultsManager: TestResultsManager) {
		vscode.workspace.onDidChangeConfiguration(() => this._onDidChangeCodeLenses.fire());
	}

	public refresh(): void {
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
		const fileResult = this.testResultsManager.getTestResult(document.uri.fsPath, FILE_RESULT_KEY);
		const fileTitle = fileResult ? getTitleForStatus(fileResult, 'File') : '$(play) Run File';
		codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
			title: fileTitle,
			command: 'pest-tests-runner.runTestFile',
			arguments: []
		}));

		// Use centralized cache for AST parsing
		const cacheKey = document.uri.toString();
		const parsedTests = parsePhpCached(text, cacheKey, document.version);

		for (const parsedTest of parsedTests) {
			const testName = decodeTestName(parsedTest.name);
			const range = new vscode.Range(parsedTest.line, 0, parsedTest.line, text.split('\n')[parsedTest.line]?.length || 0);

			if (parsedTest.type === 'describe') {
				// For describe blocks, calculate status from child tests
				const describeStatus = this.testResultsManager.getDescribeStatus(document.uri.fsPath, testName);
				const title = describeStatus ? getTitleForStatus(describeStatus) : '$(play) Run Group';

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

	switch (result.status) {
		case 'passed':
			// Use green circle emoji for visual color feedback
			return `✅ Passed${result.duration !== undefined ? ` (${formatDuration(result.duration)})` : ''}`;
		case 'failed':
			// Just show Failed status without message (message is shown inline on error line)
			return `❌ Failed`;
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
