import * as vscode from 'vscode';

export class PestCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

	constructor() {
		vscode.workspace.onDidChangeConfiguration(() => {
			this._onDidChangeCodeLenses.fire();
		});
	}

	public provideCodeLenses(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
		const config = vscode.workspace.getConfiguration('pest-runner-icons');
		const enableCodeLens = config.get<boolean>('enableCodeLens', true);

		if (!enableCodeLens) {
			return [];
		}

		// Only provide CodeLens for PHP test files
		if (!this.isPestTestFile(document)) {
			return [];
		}

		const codeLenses: vscode.CodeLens[] = [];
		const text = document.getText();
		const lines = text.split('\n');

		// Add CodeLens for the entire file (at the top)
		const fileRange = new vscode.Range(0, 0, 0, 0);
		codeLenses.push(
			new vscode.CodeLens(fileRange, {
				title: '$(run-all) Run File',
				command: 'pest-runner-icons.runTestFile',
				arguments: []
			})
		);

		// Parse and add CodeLens for each test
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Match Pest test patterns: test(), it(), describe()
			const testMatch = line.match(/^\s*(test|it)\s*\(\s*['"`]([^'"`]+)['"`]/);
			const describeMatch = line.match(/^\s*describe\s*\(\s*['"`]([^'"`]+)['"`]/);

			if (testMatch) {
				const testName = testMatch[2];
				const range = new vscode.Range(i, 0, i, line.length);

				codeLenses.push(
					new vscode.CodeLens(range, {
						title: '$(play) Run',
						command: 'pest-runner-icons.runTest',
						arguments: [testName, i]
					})
				);
			} else if (describeMatch) {
				const describeName = describeMatch[1];
				const range = new vscode.Range(i, 0, i, line.length);

				codeLenses.push(
					new vscode.CodeLens(range, {
						title: '$(run-all) Run Group',
						command: 'pest-runner-icons.runDescribeGroup',
						arguments: [describeName, i]
					})
				);
			}
		}

		return codeLenses;
	}

	private isPestTestFile(document: vscode.TextDocument): boolean {
		// Check if the file is a PHP file in a tests directory or ends with Test.php
		const filePath = document.uri.fsPath.toLowerCase();
		return (
			document.languageId === 'php' &&
			(filePath.includes('/tests/') ||
				filePath.includes('\\tests\\') ||
				filePath.endsWith('test.php'))
		);
	}
}
