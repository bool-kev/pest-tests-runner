import * as vscode from 'vscode';
import { TestResultsManager, TestResult } from './testResultsManager';
import { decodeTestName } from './phpAstParser';
import { parsePhpCached } from './utils/astWorker';

export class TestDecorationProvider {
    private errorLineDecorationType: vscode.TextEditorDecorationType;

    constructor(private testResultsManager: TestResultsManager) {
        this.errorLineDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 1em',
                color: new vscode.ThemeColor('errorForeground'),
                fontStyle: 'italic'
            },
            isWholeLine: false,
            backgroundColor: new vscode.ThemeColor('errorBackground')
        });
    }

    public updateTestDecorations(editor: vscode.TextEditor | undefined) {
        if (!editor || editor.document.languageId !== 'php') {
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const results = this.testResultsManager.getAllResultsForFile(filePath);

        if (results.length === 0) {
            editor.setDecorations(this.errorLineDecorationType, []);
            return;
        }

        // Build a map of test name -> result for quick lookup
        const resultMap = new Map<string, TestResult>();
        for (const result of results) {
            resultMap.set(result.name, result);
        }

        // Use centralized cache for AST parsing
        const cacheKey = editor.document.uri.toString();
        const parsed = parsePhpCached(editor.document.getText(), cacheKey, editor.document.version);
        const parsedTests = parsed.map(t => ({ name: decodeTestName(t.name), line: t.line }));

        const errorLineDecorations: vscode.DecorationOptions[] = [];
        const lines = editor.document.getText().split('\n');

        for (const test of parsedTests) {
            const result = resultMap.get(test.name);
            if (!result || result.status === 'none') {
                continue;
            }

            const testLineIndex = test.line;
            const range = new vscode.Range(testLineIndex, lines[testLineIndex]?.length || 0, testLineIndex, lines[testLineIndex]?.length || 0);

            // For failed tests, show error message
            if (result.status === 'failed') {
                const errorMessage = result.message || 'Test failed';
                const hasSpecificErrorLine = result.line && result.line > 0 && result.line !== testLineIndex + 1;

                if (hasSpecificErrorLine) {
                    const errorLine = result.line! - 1;
                    if (errorLine >= 0 && errorLine < lines.length) {
                        const errorRange = new vscode.Range(errorLine, lines[errorLine].length, errorLine, lines[errorLine].length);
                        errorLineDecorations.push(this.createErrorDecoration(errorRange, errorMessage, result));
                    }
                } else {
                    errorLineDecorations.push(this.createErrorDecoration(range, errorMessage, result));
                }
            }

            // For skipped tests, show skip message
            if (result.status === 'skipped' && result.message) {
                errorLineDecorations.push({
                    range,
                    renderOptions: {
                        after: {
                            contentText: ` 🟡 ${result.message}`,
                            color: new vscode.ThemeColor('testing.iconSkipped'),
                            fontStyle: 'italic'
                        }
                    },
                    hoverMessage: `**Skipped:**\n\n${result.message}`
                });
            }
        }

        editor.setDecorations(this.errorLineDecorationType, errorLineDecorations);
    }

    private createErrorDecoration(range: vscode.Range, message: string, result: TestResult): vscode.DecorationOptions {
        return {
            range,
            renderOptions: {
                after: {
                    contentText: ` ⚠️ ${message}`,
                    color: new vscode.ThemeColor('errorForeground'),
                    fontStyle: 'italic'
                }
            },
            hoverMessage: result.details 
                ? `**Error:**\n\n${result.message}\n\n**Details:**\n\`\`\`\n${result.details}\n\`\`\`` 
                : `**Error:**\n\n${result.message}`
        };
    }

    public dispose() {
        this.errorLineDecorationType.dispose();
    }
}