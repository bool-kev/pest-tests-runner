import * as vscode from 'vscode';
import { ResultStore, StoredResult } from './testing/resultStore';
import { PestTestController } from './testing/testController';
import { fileItemId, normalizePath, testItemId } from './testing/testTree';
import { formatDuration } from './utils/testResultTypes';
import { parsePhpCached } from './utils/astWorker';

export class PestCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private store: ResultStore, private testController: PestTestController) {
		this.disposables.push(
			this._onDidChangeCodeLenses,
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('pest-tests-runner')) {
					this._onDidChangeCodeLenses.fire();
				}
			}),
			// Results arrive already coalesced; only refresh when a visible editor is concerned
			store.onDidChange(files => {
				const visible = vscode.window.visibleTextEditors.some(editor => files.has(normalizePath(editor.document.uri.fsPath)));
				if (visible) {
					this._onDidChangeCodeLenses.fire();
				}
			})
		);
	}

	public refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const config = vscode.workspace.getConfiguration('pest-tests-runner', document.uri);
		if (!config.get<boolean>('enableCodeLens', true) || !this.testController.isTestDocument(document)) {
			return [];
		}

		// Same cache key and version as test discovery: parsed once per document version
		const parsedTests = parsePhpCached(document.getText(), document.uri.toString(), document.version);
		if (parsedTests.length === 0) {
			return [];
		}

		const file = document.uri.fsPath;
		const allTestIds = parsedTests.filter(test => test.type !== 'describe').map(test => testItemId(file, test.pestId));

		const codeLenses: vscode.CodeLens[] = [];
		const fileResult = this.store.aggregate(allTestIds);
		codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
			title: fileResult ? getTitleForStatus(fileResult, 'File') : '$(play) Run File',
			command: 'pest-tests-runner.runTestFile',
			arguments: [fileItemId(file)]
		}));

		for (const parsedTest of parsedTests) {
			if (parsedTest.line >= document.lineCount) {
				continue;
			}
			const range = document.lineAt(parsedTest.line).range;
			const id = testItemId(file, parsedTest.pestId);

			if (parsedTest.type === 'describe') {
				const prefix = `${id} → `;
				const describeResult = this.store.aggregate(allTestIds.filter(testId => testId.startsWith(prefix)));
				codeLenses.push(new vscode.CodeLens(range, {
					title: describeResult ? getTitleForStatus(describeResult, 'Group') : '$(play) Run Group',
					command: 'pest-tests-runner.runDescribeGroup',
					arguments: [id]
				}));
			} else {
				const result = this.store.get(id);
				codeLenses.push(new vscode.CodeLens(range, {
					title: result ? getTitleForStatus(result) : '$(play) Run',
					tooltip: result?.message,
					command: 'pest-tests-runner.runTest',
					arguments: [id]
				}));
			}
		}

		return codeLenses;
	}

	public dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}
}

function getTitleForStatus(result: StoredResult, label?: string): string {
	const defaultLabel = label || 'Run';
	const duration = result.duration !== undefined ? ` (${formatDuration(result.duration)})` : '';

	switch (result.status) {
		case 'passed':
			return `✅ Passed${duration}`;
		case 'failed':
			// Message itself is shown inline on the failing line by VS Code
			return `❌ Failed`;
		case 'errored':
			return `❌ Error`;
		case 'running':
			return `⏳ Running${label ? ` ${label}` : ''}...`;
		case 'queued':
			return `⏳ Queued`;
		case 'skipped':
			return `🟡 Skipped${duration}`;
		default:
			return `$(play) ${defaultLabel}`;
	}
}
