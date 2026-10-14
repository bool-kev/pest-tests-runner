import * as vscode from 'vscode';
import { PestCodeLensProvider } from './pestCodeLensProvider';
import { ProjectResolver } from './project/projectResolver';
import { ResultStore } from './testing/resultStore';
import { PestTestController } from './testing/testController';
import { fileItemId, projectItemId } from './testing/testTree';
import { warmupParse } from './utils/astWorker';

export class PestExtensionManager {
    private outputChannel: vscode.OutputChannel;
    private resultStore: ResultStore;
    private testController: PestTestController;
    private codeLensProvider: PestCodeLensProvider;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('Pest');
        this.resultStore = new ResultStore();
        this.testController = new PestTestController(new ProjectResolver(), this.resultStore, this.outputChannel);
        this.codeLensProvider = new PestCodeLensProvider(this.resultStore, this.testController);
    }

    public activate() {
        this.context.subscriptions.push(
            vscode.languages.registerCodeLensProvider({ language: 'php', scheme: 'file' }, this.codeLensProvider),
            this.codeLensProvider,
            this.testController,
            this.resultStore,
            this.outputChannel
        );

        this.registerCommands();

        // Warm up the PHP parser in the background to reduce first-run latency
        this.warmupParser();
    }

    /**
     * Pre-load the PHP parser to avoid cold start delay on first use
     */
    private warmupParser(): void {
        setImmediate(() => {
            try {
                warmupParse('<?php test("warmup", function() {});', '__warmup__');
            } catch {
                // Ignore warmup errors - parser will initialize on first real use
            }
        });
    }

    private registerCommands() {
        const register = (command: string, callback: (...args: any[]) => unknown) =>
            this.context.subscriptions.push(vscode.commands.registerCommand(command, callback));

        // CodeLens pass the test item id; from the command palette the test at the cursor is used
        register('pest-tests-runner.runTest', (id?: unknown) => this.runById(id, 'testing.runAtCursor', false));
        register('pest-tests-runner.runDescribeGroup', (id?: unknown) => this.runById(id, 'testing.runAtCursor', false));
        register('pest-tests-runner.debugTest', (id?: unknown) => this.runById(id, 'testing.debugAtCursor', true));

        register('pest-tests-runner.runTestFile', (id?: unknown) => {
            const fileId = typeof id === 'string' ? id : this.activeTestFile();
            return fileId ? this.runById(fileId, 'testing.runCurrentFile', false) : undefined;
        });

        register('pest-tests-runner.runTestSuite', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && this.testController.isTestDocument(editor.document)) {
                const root = this.testController.projectRootFor(editor.document.uri.fsPath);
                const project = this.testController.controller.items.get(projectItemId(root));
                if (project) {
                    return this.testController.runItems([project], false);
                }
            }
            return this.testController.runItems(undefined, false);
        });
    }

    private async runById(id: unknown, fallbackCommand: string, debug: boolean): Promise<void> {
        if (typeof id === 'string') {
            let item = this.testController.tree.findById(id);
            if (!item) {
                // Document edited since the CodeLens was computed: sync it and retry
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    this.testController.updateFromDocument(editor.document);
                    item = this.testController.tree.findById(id);
                }
            }
            if (item) {
                return this.testController.runItems([item], debug);
            }
        }
        await vscode.commands.executeCommand(fallbackCommand);
    }

    private activeTestFile(): string | undefined {
        const document = vscode.window.activeTextEditor?.document;
        if (!document || !this.testController.isTestDocument(document)) {
            return undefined;
        }
        this.testController.updateFromDocument(document);
        return fileItemId(document.uri.fsPath);
    }
}
