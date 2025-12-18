import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { TestResultsManager } from './testResultsManager';
import { PestCodeLensProvider } from './pestCodeLensProvider';
import { TestDecorationProvider } from './testDecorationProvider';
import { parseTeamcityLine, TeamcityResult, TeamcityEvent } from './teamcityParser';
import { decodeTestName as astDecodeTestName } from './phpAstParser';
import { throttle } from './utils/throttle';
import { parsePhpAsync } from './utils/astWorker';
import {
    parseTeamcityTestName,
    extractErrorLineFromStackTrace,
    formatDuration,
    getStatusIcon,
    formatErrorMessage
} from './utils/testResultTypes';

// Minimum interval between UI updates (ms)
const UI_UPDATE_THROTTLE_MS = 100;

export class TestRunner {
    private sharedTerminal: vscode.Terminal | undefined;
    private currentExecutionContext: {
        type: 'test' | 'describe' | 'file' | 'suite' | null;
        describeName?: string;
        describesInExecution: Set<string>;
    } = { type: null, describesInExecution: new Set() };

    // Throttled UI update functions to prevent excessive refreshes
    private throttledRefreshUI: ReturnType<typeof throttle>;
    private throttledUpdateDecorations: ReturnType<typeof throttle>;

    constructor(
        private testResultsManager: TestResultsManager,
        private codeLensProvider: PestCodeLensProvider,
        private decorationProvider: TestDecorationProvider,
        private outputChannel: vscode.OutputChannel
    ) {
        // Create throttled versions of UI update functions
        this.throttledRefreshUI = throttle(() => {
            this.codeLensProvider.refresh();
        }, UI_UPDATE_THROTTLE_MS);

        this.throttledUpdateDecorations = throttle(() => {
            this.decorationProvider.updateTestDecorations(vscode.window.activeTextEditor);
        }, UI_UPDATE_THROTTLE_MS);
    }

    public async runTest(testName: string, line: number) {
        await this.executeTestCommand(testName, false, false, 'test');
    }

    public async runDescribeGroup(groupName: string, line: number) {
        await this.executeTestCommand(groupName, false, false, 'describe');
    }

    public async runTestFile() {
        await this.executeTestCommand('', true, false, 'file');
    }

    public async runTestSuite() {
        await this.executeTestCommand('', false, true, 'suite');
    }

    private async executeTestCommand(
        testName: string,
        runFile: boolean,
        runSuite: boolean,
        type: 'test' | 'describe' | 'file' | 'suite'
    ) {
        // Set execution context to track what is being run
        this.currentExecutionContext = {
            type,
            describeName: type === 'describe' ? testName : undefined,
            describesInExecution: new Set()
        };

        // Simple, clean header
        const typeLabel = type === 'test' ? 'Test' : type === 'describe' ? 'Group' : type === 'file' ? 'File' : 'Suite';
        this.log(`\n🚀 Running ${typeLabel}${testName ? `: "${testName}"` : ''}...`);

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

        // Get configuration options
        const config = vscode.workspace.getConfiguration('pest-tests-runner');
        const customPestPath = config.get<string>('pestBinaryPath', '');
        const showTerminal = config.get<boolean>('showTerminal', false);
        const focusOutput = config.get<boolean>('focusOutputOnRun', true);
        const autoSave = config.get<boolean>('autoSaveBeforeRun', true);
        const debugMode = config.get<boolean>('debugMode', false);

        // Auto-save the file before running tests if configured
        if (autoSave && editor.document.isDirty) {
            await editor.document.save();
        }

        // Focus output channel if configured
        if (focusOutput) {
            this.outputChannel.show(true); // true = preserveFocus
        }

        // Determine the correct Pest binary path
        // For Windows with bash.exe, we need to check if we're in a bash environment
        const isWindows = process.platform === 'win32';
        const shellPath = vscode.env.shell.toLowerCase();
        const isBashOnWindows = isWindows && (shellPath.includes('bash') || shellPath.includes('git'));

        // Use custom path if provided, otherwise auto-detect
        let pestBinary: string;
        let filePathForCommand: string;

        if (customPestPath) {
            // Use custom path as-is
            pestBinary = customPestPath;
            this.log(`  Using custom Pest binary path: ${pestBinary}`);
            filePathForCommand = filePath;
        } else if (isBashOnWindows) {
            // For bash on Windows, use forward slashes and no .bat extension
            pestBinary = './vendor/bin/pest';
            // Convert Windows path to bash-friendly path (keep as is, bash handles it)
            filePathForCommand = filePath.replace(/\\/g, '/');
        } else if (isWindows) {
            // For cmd/powershell on Windows, use backslashes and .bat extension
            pestBinary = '.\\vendor\\bin\\pest.bat';
            filePathForCommand = filePath;
        } else {
            // For Unix/Linux/Mac
            pestBinary = './vendor/bin/pest';
            filePathForCommand = filePath;
        }

        // Build command args for spawn (Teamcity format for streaming)
        let args: string[] = [];
        if (runSuite) {
            args = ['--teamcity'];
        } else if (runFile) {
            args = [filePathForCommand, '--teamcity'];
        } else if (testName) {
            // Escape the test name to handle apostrophes, backslashes, and other special characters
            const escapedTestName = this.escapeTestName(testName);
            // Wrap in double quotes to handle spaces in test names when shell: true
            args = [filePathForCommand, '--filter', `"${escapedTestName}"`, '--teamcity'];
        }

        // If debug mode is enabled, launch VS Code debugger with Xdebug
        if (debugMode) {
            return this.executeWithDebugger(workspaceFolder, filePath, pestBinary, args, testName, type);
        }

        // Start execution tracking for timing and summary
        this.testResultsManager.startExecution(filePath);

        // Set running status for tests using batch mode to avoid multiple UI refreshes
        this.testResultsManager.startBatch();
        try {
            if (testName && type === 'test') {
                // Single test execution - status will be logged when testStarted event is received
                this.testResultsManager.setTestResult(filePath, testName, 'running', 0, type);
            } else if (testName && type === 'describe') {
                // Describe group execution - set all tests in group to running
                this.logResult(`Running group "${testName}"...`, 'running');
                this.testResultsManager.setTestResult(filePath, testName, 'running', 0, type);

                const testsInGroup = await this.extractTestNamesFromDescribeAsync(filePath, testName);
                for (const individualTest of testsInGroup) {
                    this.testResultsManager.setTestResult(filePath, individualTest, 'running', 0, 'test');
                }
            } else if (runFile) {
                // File execution - set file-level status and all tests to running
                this.testResultsManager.setTestResult(filePath, '__FILE__', 'running', 0, 'test');
                const testsInFile = await this.extractTestNamesFromFileAsync(filePath);
                for (const individualTest of testsInFile) {
                    this.testResultsManager.setTestResult(filePath, individualTest, 'running', 0, 'test');
                }
            } else if (runSuite) {
                // Suite execution - set file-level status to running
                this.testResultsManager.setTestResult(filePath, '__FILE__', 'running', 0, 'test');
            }
        } finally {
            this.testResultsManager.endBatch();
            this.codeLensProvider.refresh();
        }

        // Terminal handling - only show if configured
        if (showTerminal) {
            if (!this.sharedTerminal || this.sharedTerminal.exitStatus !== undefined) {
                this.sharedTerminal = vscode.window.createTerminal({
                    name: 'Pest Test Runner',
                    cwd: workspaceFolder.uri.fsPath
                });
            }
            this.sharedTerminal.show();
            const terminalCommand = `${pestBinary} ${args.join(' ')}`;
            this.sharedTerminal.sendText(terminalCommand);
        }

        // Execute with spawn for real-time streaming
        return new Promise<void>((resolve, reject) => {
            // Cache for tracking test results by flowId
            const testCache = new Map<number, TeamcityResult>();
            let buffer = '';

            // Spawn options
            const spawnOptions: any = {
                cwd: workspaceFolder.uri.fsPath,
                shell: isBashOnWindows ? vscode.env.shell : true
            };

            const process = spawn(pestBinary, args, spawnOptions);

            process.stdout?.on('data', (data: Buffer) => {
                buffer += data.toString();
                const lines = buffer.split('\n');

                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';

                // Process each complete line
                for (const line of lines) {
                    if (line.trim()) {
                        const result = parseTeamcityLine(line);
                        if (result) {
                            this.handleTeamcityEvent(result, filePath, testCache);
                        }
                    }
                }
            });

            process.stderr?.on('data', (data: Buffer) => {
                const line = data.toString().trim();
                if (line) {
                    this.log(`⚠️ ${line}`, 'warning');
                }
            });

            process.on('close', (code) => {
                // If we have a buffer left, try to parse it
                if (buffer.trim()) {
                    const result = parseTeamcityLine(buffer);
                    if (result) {
                        this.handleTeamcityEvent(result, filePath, testCache);
                    }
                }

                // Finalize describe and file statuses based on test results
                const shouldFinalizeFile = this.currentExecutionContext.type === 'file' || this.currentExecutionContext.type === 'suite';
                const describesInExecution = this.currentExecutionContext.describesInExecution;

                // Also include the describe being run directly if type is 'describe'
                if (this.currentExecutionContext.type === 'describe' && this.currentExecutionContext.describeName) {
                    describesInExecution.add(this.currentExecutionContext.describeName);
                }

                // Finalize group statuses
                this.testResultsManager.finalizeGroupStatuses(filePath, describesInExecution, shouldFinalizeFile);

                // End execution tracking and show summary
                const summary = this.testResultsManager.endExecution();
                if (summary && summary.total > 0) {
                    this.log(this.testResultsManager.formatSummary(summary));
                }

                // Flush any pending throttled updates and do final refresh
                this.throttledRefreshUI.flush();
                this.throttledUpdateDecorations.flush();
                this.codeLensProvider.refresh();
                this.decorationProvider.updateTestDecorations(vscode.window.activeTextEditor);

                resolve();
            });

            process.on('error', (err) => {
                this.log(`Error spawning process: ${err.message}`, 'error');
                reject(err);
            });
        });
    }

    /**
     * Handle Teamcity events with improved parsing and result management
     */
    private handleTeamcityEvent(result: TeamcityResult, filePath: string, testCache: Map<number, TeamcityResult>) {
        const flowId = result.flowId || 0;

        // Parse the test name from Teamcity hierarchical format
        // e.g., "`Describe` → it should work" -> { testName: "should work", describePath: ["Describe"] }
        let testName = result.name || '';
        let describeName: string | undefined;

        if (result.name) {
            const parsed = parseTeamcityTestName(result.name);
            testName = parsed.testName;
            describeName = parsed.describePath.length > 0 ? parsed.describePath[0] : undefined;

            // Track describes during file/suite execution
            if (this.currentExecutionContext.type === 'file' || this.currentExecutionContext.type === 'suite') {
                parsed.describePath.forEach(d => this.currentExecutionContext.describesInExecution.add(d));
            }
        }

        switch (result.event) {
            case TeamcityEvent.testStarted:
                if (testName) {
                    // Store in cache with parsed name
                    testCache.set(flowId, { ...result, name: testName });

                    // Track start time for duration calculation
                    this.testResultsManager.markTestStarted(testName);

                    // Update status using new API
                    this.testResultsManager.setResult(filePath, {
                        name: testName,
                        status: 'running',
                        type: 'test',
                        flowId,
                        describeName
                    });

                    this.logResult(`${testName}`, 'running');

                    // Throttled UI update
                    this.throttledRefreshUI();
                    this.throttledUpdateDecorations();
                }
                break;

            case TeamcityEvent.testFinished:
                if (testName) {
                    // Duration from Teamcity (in ms) or calculated from start time
                    const durationMs = result.duration || 0;
                    const durationSec = durationMs / 1000;

                    // Check if test already has a final status (failed/skipped set before testFinished)
                    const currentStatus = this.testResultsManager.getTestResult(filePath, testName)?.status;

                    if (currentStatus !== 'failed' && currentStatus !== 'skipped') {
                        this.testResultsManager.setResult(filePath, {
                            name: testName,
                            status: 'passed',
                            type: 'test',
                            duration: durationSec,
                            flowId,
                            describeName
                        });

                        this.logResult(`${testName} ${formatDuration(durationSec)}`, 'passed');
                    } else {
                        // Update duration for failed/skipped tests
                        const existing = this.testResultsManager.getTestResult(filePath, testName);
                        if (existing && !existing.duration && durationSec > 0) {
                            this.testResultsManager.setResult(filePath, {
                                name: testName,
                                duration: durationSec
                            });
                        }
                    }

                    testCache.delete(flowId);

                    // Throttled UI update
                    this.throttledRefreshUI();
                    this.throttledUpdateDecorations();
                }
                break;

            case TeamcityEvent.testFailed:
                if (testName) {
                    const message = result.message || 'Test failed';
                    const details = result.details || '';

                    // Extract line number from stack trace
                    const errorLine = extractErrorLineFromStackTrace(details, filePath);

                    this.testResultsManager.setResult(filePath, {
                        name: testName,
                        status: 'failed',
                        type: 'test',
                        errorLine,
                        errorMessage: message,
                        errorDetails: details,
                        flowId,
                        describeName
                    });

                    // Log with formatted message
                    const shortMessage = formatErrorMessage(message, 60);
                    this.logResult(`${testName}: ${shortMessage}`, 'failed');

                    // Throttled UI update
                    this.throttledRefreshUI();
                    this.throttledUpdateDecorations();
                }
                break;

            case TeamcityEvent.testIgnored:
                if (testName) {
                    const skipReason = result.message || 'Skipped';

                    this.testResultsManager.setResult(filePath, {
                        name: testName,
                        status: 'skipped',
                        type: 'test',
                        skipReason,
                        flowId,
                        describeName
                    });

                    this.logResult(`${testName}: ${skipReason}`, 'skipped');

                    // Throttled UI update
                    this.throttledRefreshUI();
                    this.throttledUpdateDecorations();
                }
                break;

            case TeamcityEvent.testSuiteFinished:
                // Suite finished - show summary
                if (this.currentExecutionContext.type === 'file' || this.currentExecutionContext.type === 'suite') {
                    const summary = this.testResultsManager.getExecutionSummary(filePath);
                    if (summary.total > 0) {
                        this.log(this.testResultsManager.formatSummary(summary));
                    }
                }
                break;
        }
    }

    /**
     * Execute tests with VS Code debugger (Xdebug)
     */
    private async executeWithDebugger(
        workspaceFolder: vscode.WorkspaceFolder,
        filePath: string,
        pestBinary: string,
        args: string[],
        testName: string,
        type: 'test' | 'describe' | 'file' | 'suite'
    ): Promise<void> {
        // The debugger needs the actual PHP script, not a .bat wrapper
        let pestPhpPath: string;

        if (pestBinary.endsWith('.bat')) {
            // Windows .bat wrapper - use the PHP script instead (remove .bat)
            pestPhpPath = path.join(workspaceFolder.uri.fsPath, 'vendor', 'bin', 'pest');
        } else {
            // Already a PHP script path - resolve to absolute
            pestPhpPath = path.isAbsolute(pestBinary)
                ? pestBinary
                : path.join(workspaceFolder.uri.fsPath, pestBinary.replace(/^\.[\\/]/, ''));
        }

        if (!fs.existsSync(pestPhpPath)) {
            vscode.window.showErrorMessage(
                `Could not find Pest binary for debugging at: ${pestPhpPath}. Check your "pest-tests-runner.pestBinaryPath" setting.`
            );
            return;
        }

        const debugConfig: vscode.DebugConfiguration = {
            type: 'php',
            request: 'launch',
            name: `Pest Debug: ${testName || type}`,
            program: pestPhpPath,
            args: args,
            cwd: workspaceFolder.uri.fsPath,
            env: {
                XDEBUG_MODE: 'debug'
            }
        };

        this.log(`🐛 Starting debugger for ${type}${testName ? `: "${testName}"` : ''}...`);

        try {
            const started = await vscode.debug.startDebugging(workspaceFolder, debugConfig);
            if (!started) {
                vscode.window.showErrorMessage(
                    'Failed to start debugger. Make sure the PHP Debug extension is installed and Xdebug is configured.'
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Debugger error: ${error}`);
        }
    }

    private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    private logResult(message: string, status: 'passed' | 'failed' | 'skipped' | 'running') {
        const icon = getStatusIcon(status);
        this.outputChannel.appendLine(`  ${icon} ${message}`);
    }

    private escapeTestName(testName: string): string {
        // For shell commands, we need to escape:
        // - Single quotes (') -> '\''
        // - Backslashes (\) -> \\
        // - Double quotes (") -> \"

        return testName
            .replace(/\\/g, '\\\\')        // Escape backslashes first
            .replace(/"/g, '\\"')          // Escape double quotes
            .replace(/'/g, "\\'");         // Escape single quotes
    }

    /**
     * Async version of extractTestNamesFromFile - uses non-blocking file read and async AST parser
     */
    private async extractTestNamesFromFileAsync(filePath: string): Promise<string[]> {
        const testNames: string[] = [];

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');

            // Use async AST parser to avoid blocking UI for large files
            const parsedTests = await parsePhpAsync(content, filePath);

            for (const test of parsedTests) {
                // Only include test() and it(), not describe()
                if (test.type === 'test' || test.type === 'it') {
                    const decodedName = astDecodeTestName(test.name);
                    testNames.push(decodedName);
                }
            }
        } catch (error) {
            this.log(`Error reading file: ${error}`);
        }

        return testNames;
    }

    /**
     * Async version of extractTestNamesFromDescribe - uses non-blocking file read and async AST parser
     */
    private async extractTestNamesFromDescribeAsync(filePath: string, describeName: string): Promise<string[]> {
        const testNames: string[] = [];

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');

            // Use async AST parser to avoid blocking UI
            const parsedTests = await parsePhpAsync(content, filePath);

            // Find the describe block with matching name
            let describeLineNumber = -1;
            let nextDescribeLineNumber = Number.MAX_SAFE_INTEGER;

            for (const test of parsedTests) {
                if (test.type === 'describe') {
                    const decodedName = astDecodeTestName(test.name);
                    if (decodedName === describeName && describeLineNumber === -1) {
                        // Found our target describe
                        describeLineNumber = test.line;
                    } else if (describeLineNumber !== -1 && test.line > describeLineNumber) {
                        // Found next describe after our target - this is the boundary
                        nextDescribeLineNumber = test.line;
                        break;
                    }
                }
            }

            // If we found the describe, extract all tests between it and the next describe
            if (describeLineNumber !== -1) {
                for (const test of parsedTests) {
                    if ((test.type === 'test' || test.type === 'it') &&
                        test.line > describeLineNumber &&
                        test.line < nextDescribeLineNumber) {
                        const decodedName = astDecodeTestName(test.name);
                        testNames.push(decodedName);
                    }
                }
            }
        } catch (error) {
            this.log(`Error reading file: ${error}`);
        }

        return testNames;
    }

}
