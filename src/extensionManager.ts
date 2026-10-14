import * as vscode from 'vscode';
import { PestCodeLensProvider } from './pestCodeLensProvider';
import { TestResultsManager } from './testResultsManager';
import { TestDecorationProvider } from './testDecorationProvider';
import { TestRunner } from './testRunner';
import { warmupParse } from './utils/astWorker';

export class PestExtensionManager {
    private outputChannel: vscode.OutputChannel;
    private testResultsManager: TestResultsManager;
    private codeLensProvider: PestCodeLensProvider;
    private decorationProvider: TestDecorationProvider;
    private testRunner: TestRunner;

    constructor(private context: vscode.ExtensionContext) {
        // Create output channel
        this.outputChannel = vscode.window.createOutputChannel('Pest Runner Icons');
        this.outputChannel.appendLine('🐛 Pest Runner Icons activated!');

        // Initialize managers
        this.testResultsManager = new TestResultsManager();
        this.codeLensProvider = new PestCodeLensProvider(this.testResultsManager);
        this.decorationProvider = new TestDecorationProvider(this.testResultsManager);
        this.testRunner = new TestRunner(
            this.testResultsManager,
            this.codeLensProvider,
            this.decorationProvider,
            this.outputChannel
        );
    }

    public activate() {
        // Register CodeLens provider
        const codeLensDisposable = vscode.languages.registerCodeLensProvider(
            { language: 'php', scheme: 'file' },
            this.codeLensProvider
        );

        // Register event listeners
        this.registerEventListeners();

        // Register commands
        this.registerCommands();

        this.context.subscriptions.push(
            codeLensDisposable,
            this.outputChannel,
            { dispose: () => this.decorationProvider.dispose() }
        );

        // Warm up the PHP parser in the background to reduce first-run latency
        this.warmupParser();
    }

    /**
     * Pre-load the PHP parser to avoid cold start delay on first test run
     * This runs in the background and doesn't block extension activation
     * Results are cached in the centralized cache for immediate reuse
     */
    private warmupParser(): void {
        // Use setImmediate to not block activation
        setImmediate(() => {
            try {
                // Parse a minimal PHP snippet to initialize the parser engine
                warmupParse('<?php test("warmup", function() {});', '__warmup__');

                // Also warm up with the current active file if it's PHP
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.languageId === 'php') {
                    const content = editor.document.getText();
                    // Only parse if file is not too large (avoid blocking on huge files)
                    if (content.length < 50000) {
                        const cacheKey = editor.document.uri.toString();
                        warmupParse(content, cacheKey);
                    }
                }
            } catch {
                // Ignore warmup errors - parser will initialize on first real use
            }
        });
    }

    private registerEventListeners() {
        // Refresh CodeLens when test results change
        this.testResultsManager.onDidChangeResults(() => {
            this.codeLensProvider.refresh();
            vscode.commands.executeCommand('editor.action.codeLensRefresh');
            this.decorationProvider.updateTestDecorations(vscode.window.activeTextEditor);
        });

        // Update decorations when editor changes
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.decorationProvider.updateTestDecorations(editor);
            }
        }, null, this.context.subscriptions);

        // Update decorations on text changes
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                this.decorationProvider.updateTestDecorations(editor);
            }
        }, null, this.context.subscriptions);
    }

    private registerCommands() {
        const runTestCommand = vscode.commands.registerCommand(
            'pest-tests-runner.runTest',
            async (testName: string, line: number) => {
                await this.testRunner.runTest(testName, line);
            }
        );

        const runTestFileCommand = vscode.commands.registerCommand(
            'pest-tests-runner.runTestFile',
            async () => {
                await this.testRunner.runTestFile();
            }
        );

        const runTestSuiteCommand = vscode.commands.registerCommand(
            'pest-tests-runner.runTestSuite',
            async () => {
                await this.testRunner.runTestSuite();
            }
        );

        const runDescribeGroupCommand = vscode.commands.registerCommand(
            'pest-tests-runner.runDescribeGroup',
            async (groupName: string, line: number) => {
                await this.testRunner.runDescribeGroup(groupName, line);
            }
        );

        this.context.subscriptions.push(
            runTestCommand,
            runTestFileCommand,
            runTestSuiteCommand,
            runDescribeGroupCommand
        );
    }
}
