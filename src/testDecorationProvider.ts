import * as vscode from 'vscode';
import { TestResultsManager } from './testResultsManager';

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
            return;
        }

        const errorLineDecorations: vscode.DecorationOptions[] = [];
        const text = editor.document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const testMatch = line.match(/^\s*(test|it)\s*\(\s*(['"`])((?:(?!\2).|\\.)*)\2/);
            const describeMatch = line.match(/^\s*describe\s*\(\s*(['"`])((?:(?!\1).|\\.)*)\1/);

            if (testMatch || describeMatch) {
                const testName = testMatch ? testMatch[3] : describeMatch![2];
                const result = results.find(r => r.name === testName);

                if (result && result.status !== 'none') {
                    const range = new vscode.Range(i, line.length, i, line.length);

                    // For failed tests, show error message at the specific line or on test line if not detected
                    if (result.status === 'failed') {
                        const errorMessage = result.message || 'Test failed';
                        const hasSpecificErrorLine = result.line && result.line > 0 && result.line !== i + 1;

                        if (hasSpecificErrorLine) {
                            // Show error on the specific line where it occurred
                            const errorLine = result.line! - 1; // Convert to 0-based index
                            if (errorLine >= 0 && errorLine < lines.length) {
                                const errorRange = new vscode.Range(errorLine, lines[errorLine].length, errorLine, lines[errorLine].length);
                                errorLineDecorations.push({
                                    range: errorRange,
                                    renderOptions: {
                                        after: {
                                            contentText: ` ⚠️ ${errorMessage}`,
                                            color: new vscode.ThemeColor('errorForeground'),
                                            fontStyle: 'italic'
                                        }
                                    },
                                    hoverMessage: result.details ? `**Error:**\n\n${result.message}\n\n**Details:**\n\`\`\`\n${result.details}\n\`\`\`` : `**Error:**\n\n${result.message}`
                                });
                            }
                        } else {
                            // No specific line detected - show error on test line
                            errorLineDecorations.push({
                                range,
                                renderOptions: {
                                    after: {
                                        contentText: ` ⚠️ ${errorMessage}`,
                                        color: new vscode.ThemeColor('errorForeground'),
                                        fontStyle: 'italic'
                                    }
                                },
                                hoverMessage: result.details ? `**Error:**\n\n${result.message}\n\n**Details:**\n\`\`\`\n${result.details}\n\`\`\`` : `**Error:**\n\n${result.message}`
                            });
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
            }
        }

        editor.setDecorations(this.errorLineDecorationType, errorLineDecorations);
    }
}
