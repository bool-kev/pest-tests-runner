import * as vscode from 'vscode';
import { PestCodeLensProvider } from './pestCodeLensProvider';
import { TestResultsManager } from './testResultsManager';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseTeamcityLine, extractTestId, formatDuration as formatTeamcityDuration, TeamcityEvent, TeamcityResult } from './teamcityParser';
import { parseTestsFromPhp, decodeTestName as astDecodeTestName } from './phpAstParser';

let testResultsManager: TestResultsManager;
let codeLensProvider: PestCodeLensProvider;
let sharedTerminal: vscode.Terminal | undefined;
let outputChannel: vscode.OutputChannel;

// Track the current execution context (what is being run)
let currentExecutionContext: {
	type: 'test' | 'describe' | 'file' | 'suite' | null;
	describeName?: string;
	describesInExecution: Set<string>; // Track all describes found during file/suite execution
} = { type: null, describesInExecution: new Set() };

// Text decorations for colored test status in editor
let passedDecorationType: vscode.TextEditorDecorationType;
let failedDecorationType: vscode.TextEditorDecorationType;
let runningDecorationType: vscode.TextEditorDecorationType;
let skippedDecorationType: vscode.TextEditorDecorationType;

export function activate(context: vscode.ExtensionContext) {
	// Create output channel for logs
	outputChannel = vscode.window.createOutputChannel('Pest Runner Icons');
	outputChannel.appendLine('🐛 Pest Runner Icons activated!');

	// Create text decorations for test status colors
	passedDecorationType = vscode.window.createTextEditorDecorationType({
		after: {
			margin: '0 0 0 1em',
			color: new vscode.ThemeColor('testing.iconPassed'),
			fontWeight: 'bold'
		},
		isWholeLine: false
	});

	failedDecorationType = vscode.window.createTextEditorDecorationType({
		after: {
			margin: '0 0 0 1em',
			color: new vscode.ThemeColor('testing.iconFailed'),
			fontWeight: 'bold'
		},
		isWholeLine: false
	});

	runningDecorationType = vscode.window.createTextEditorDecorationType({
		after: {
			margin: '0 0 0 1em',
			color: new vscode.ThemeColor('testing.iconQueued'),
			fontWeight: 'bold'
		},
		isWholeLine: false
	});

	skippedDecorationType = vscode.window.createTextEditorDecorationType({
		after: {
			margin: '0 0 0 1em',
			color: new vscode.ThemeColor('testing.iconSkipped'),
			fontWeight: 'bold'
		},
		isWholeLine: false
	});

	// Initialize test results manager
	testResultsManager = new TestResultsManager();

	// Register CodeLens provider for PHP files
	codeLensProvider = new PestCodeLensProvider(testResultsManager);
	const codeLensDisposable = vscode.languages.registerCodeLensProvider(
		{ language: 'php', scheme: 'file' },
		codeLensProvider
	);

	// Refresh CodeLens when test results change
	testResultsManager.onDidChangeResults(() => {
		codeLensProvider.refresh();
		vscode.commands.executeCommand('editor.action.codeLensRefresh');
		updateTestDecorations();
	});

	// Update decorations when editor changes
	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			updateTestDecorations();
		}
	}, null, context.subscriptions);

	// Update decorations on text changes
	vscode.workspace.onDidChangeTextDocument(event => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) {
			updateTestDecorations();
		}
	}, null, context.subscriptions);

	// Register commands
	const runTestCommand = vscode.commands.registerCommand(
		'pest-tests-runner.runTest',
		async (testName: string, line: number) => {
			await runTest(testName, line);
		}
	);

	const runTestFileCommand = vscode.commands.registerCommand(
		'pest-tests-runner.runTestFile',
		async () => {
			await runTestFile();
		}
	);

	const runTestSuiteCommand = vscode.commands.registerCommand(
		'pest-tests-runner.runTestSuite',
		async () => {
			await runTestSuite();
		}
	);

	const runDescribeGroupCommand = vscode.commands.registerCommand(
		'pest-tests-runner.runDescribeGroup',
		async (groupName: string, line: number) => {
			await runDescribeGroup(groupName, line);
		}
	);

	context.subscriptions.push(
		codeLensDisposable,
		runTestCommand,
		runTestFileCommand,
		runTestSuiteCommand,
		runDescribeGroupCommand,
		outputChannel,
		passedDecorationType,
		failedDecorationType,
		runningDecorationType,
		skippedDecorationType
	);
}

function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
	const timestamp = new Date().toLocaleTimeString();
	outputChannel.appendLine(`[${timestamp}] ${message}`);
}

/**
 * Update test decorations (colored status indicators) in the active editor
 */
function updateTestDecorations() {
	const config = vscode.workspace.getConfiguration('pest-tests-runner');
	const showInlineResults = config.get<boolean>('showInlineResults', true);

	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'php') {
		return;
	}

	// Clear decorations if disabled
	if (!showInlineResults) {
		editor.setDecorations(passedDecorationType, []);
		editor.setDecorations(failedDecorationType, []);
		editor.setDecorations(runningDecorationType, []);
		editor.setDecorations(skippedDecorationType, []);
		return;
	}

	const filePath = editor.document.uri.fsPath;
	const results = testResultsManager.getAllResultsForFile(filePath);

	if (results.length === 0) {
		return;
	}

	const passedDecorations: vscode.DecorationOptions[] = [];
	const failedDecorations: vscode.DecorationOptions[] = [];
	const runningDecorations: vscode.DecorationOptions[] = [];
	const skippedDecorations: vscode.DecorationOptions[] = [];

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
				let statusText = '';
				let decorationArray: vscode.DecorationOptions[] | null = null;

				switch (result.status) {
					case 'passed':
						statusText = `✅ ${formatDuration(result.duration || 0)}`;
						decorationArray = passedDecorations;
						break;
					case 'failed':
						// Show error message instead of duration for failed tests
						const errorMsg = result.message ? result.message.substring(0, 60) : 'Failed';
						statusText = `❌ ${errorMsg}${result.message && result.message.length > 60 ? '...' : ''}`;
						decorationArray = failedDecorations;
						break;
					case 'running':
						statusText = '⏳ Running...';
						decorationArray = runningDecorations;
						break;
					case 'skipped':
						statusText = `🟡 ${formatDuration(result.duration || 0)}`;
						decorationArray = skippedDecorations;
						break;
				}				if (decorationArray) {
					decorationArray.push({
						range,
						renderOptions: {
							after: {
								contentText: ` ${statusText}`
							}
						}
					});
				}
			}
		}
	}

	editor.setDecorations(passedDecorationType, passedDecorations);
	editor.setDecorations(failedDecorationType, failedDecorations);
	editor.setDecorations(runningDecorationType, runningDecorations);
	editor.setDecorations(skippedDecorationType, skippedDecorations);
}

function logDebug(message: string) {
	// Only log debug messages if debug mode is enabled
	const config = vscode.workspace.getConfiguration('pest-tests-runner');
	const debugMode = config.get<boolean>('debugMode', false);
	if (debugMode) {
		const timestamp = new Date().toLocaleTimeString();
		outputChannel.appendLine(`[${timestamp}] 🐛 ${message}`);
	}
}

/**
 * Format duration for display
 * Shows more precision for very fast tests (< 0.01s) to avoid confusion with 0.00s
 */
function formatDuration(duration: number): string {
	if (duration < 0.01) {
		// For very fast tests, show up to 4 decimal places
		return `${duration.toFixed(4)}s`;
	}
	return `${duration.toFixed(2)}s`;
}

function logResult(message: string, status: 'passed' | 'failed' | 'skipped' | 'running') {
	const timestamp = new Date().toLocaleTimeString();
	let icon = '';

	switch (status) {
		case 'passed':
			icon = '✅';
			break;
		case 'failed':
			icon = '❌';
			break;
		case 'skipped':
			icon = '🟡';
			break;
		case 'running':
			icon = '⏳';
			break;
	}

	outputChannel.appendLine(`[${timestamp}] ${icon} ${message}`);
}

// XML helper functions removed - now using Teamcity streaming format

/**
 * Escape special characters in test names for shell command execution
 * Handles: apostrophes, backslashes, double quotes, and other special chars
 */
function escapeTestName(testName: string): string {
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
 * Decode escaped characters in test/describe names captured from regex
 * Converts: "nom avec l\'apostrophe" -> "nom avec l'apostrophe"
 * Converts: "nom avec \"quote" -> "nom avec "quote"
 */
function decodeTestName(rawName: string): string {
	return rawName
		.replace(/\\'/g, "'")   // \' -> '
		.replace(/\\"/g, '"')   // \" -> "
		.replace(/\\\\/g, '\\'); // \\ -> \
}

/**
 * Extract all test names from a PHP test file
 * Returns an array of test names found in the file
 */
function extractTestNamesFromFile(filePath: string): string[] {
	const testNames: string[] = [];

	try {
		const content = fs.readFileSync(filePath, 'utf-8');

		// Use AST parser for more reliable extraction
		const parsedTests = parseTestsFromPhp(content);

		for (const test of parsedTests) {
			// Only include test() and it(), not describe()
			if (test.type === 'test' || test.type === 'it') {
				const decodedName = astDecodeTestName(test.name);
				testNames.push(decodedName);
			}
		}
	} catch (error) {
		logDebug(`Error reading file for test extraction: ${error}`);
	}

	return testNames;
}

/**
 * Extract all test names within a specific describe block
 * Returns an array of test names found in the describe block
 * 
 * Note: AST parsing makes this simpler, but we still need to identify which
 * tests belong to which describe. For now, we use a simple heuristic:
 * - Find the describe block line number
 * - Find all tests that come after it (until next describe or end of file)
 * 
 * This works for most cases. For complex nested describes, Pest's --filter
 * with the describe name will handle it correctly.
 */
function extractTestNamesFromDescribe(filePath: string, describeName: string): string[] {
	const testNames: string[] = [];

	try {
		const content = fs.readFileSync(filePath, 'utf-8');

		// Use AST parser
		const parsedTests = parseTestsFromPhp(content);

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
		logDebug(`Error reading file for describe extraction: ${error}`);
	}

	return testNames;
}

async function runTest(testName: string, line: number) {
	await executeTestCommand(testName, false, false, 'test');
}

async function runDescribeGroup(groupName: string, line: number) {
	await executeTestCommand(groupName, false, false, 'describe');
}

async function runTestFile() {
	await executeTestCommand('', true, false, 'file');
}

async function runTestSuite() {
	await executeTestCommand('', false, true, 'suite');
}

async function executeTestCommand(
	testName: string,
	runFile: boolean,
	runSuite: boolean,
	type: 'test' | 'describe' | 'file' | 'suite'
) {
	// Set execution context to track what is being run
	currentExecutionContext = {
		type,
		describeName: type === 'describe' ? testName : undefined,
		describesInExecution: new Set()
	};

	// Simple, clean header
	const typeLabel = type === 'test' ? 'Test' : type === 'describe' ? 'Group' : type === 'file' ? 'File' : 'Suite';
	log(`\n🚀 Running ${typeLabel}${testName ? `: "${testName}"` : ''}...`);

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

	// Auto-save the file before running tests if configured
	if (autoSave && editor.document.isDirty) {
		logDebug('Auto-saving file before test execution');
		await editor.document.save();
	}

	// Focus output channel if configured
	if (focusOutput) {
		outputChannel.show(true); // true = preserveFocus
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
		log(`  Using custom Pest binary path: ${pestBinary}`);
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

	logDebug(`File Path: ${filePath}`);
	logDebug(`File Path for Command: ${filePathForCommand}`);
	logDebug(`Platform: ${process.platform}`);
	logDebug(`Shell: ${vscode.env.shell}`);
	logDebug(`Is Bash on Windows: ${isBashOnWindows}`);
	logDebug(`Pest Binary: ${pestBinary}`);

	// Build command args for spawn (Teamcity format for streaming)
	let args: string[] = [];
	if (runSuite) {
		args = ['--teamcity'];
	} else if (runFile) {
		args = [filePathForCommand, '--teamcity'];
	} else if (testName) {
		// Escape the test name to handle apostrophes, backslashes, and other special characters
		const escapedTestName = escapeTestName(testName);
		// Wrap in double quotes to handle spaces in test names when shell: true
		args = [filePathForCommand, '--filter', `"${escapedTestName}"`, '--teamcity'];
	}

	logDebug(`Command: ${pestBinary} ${args.join(' ')}`);

	// Set running status for tests
	if (testName && type === 'test') {
		// Single test execution
		logResult(`Running "${testName}"...`, 'running');
		testResultsManager.setTestResult(filePath, testName, 'running', 0, type);
	} else if (testName && type === 'describe') {
		// Describe group execution - set all tests in group to running
		logResult(`Running group "${testName}"...`, 'running');
		testResultsManager.setTestResult(filePath, testName, 'running', 0, type);

		const testsInGroup = extractTestNamesFromDescribe(filePath, testName);
		logDebug(`Found ${testsInGroup.length} tests in describe group "${testName}"`);
		for (const individualTest of testsInGroup) {
			testResultsManager.setTestResult(filePath, individualTest, 'running', 0, 'test');
		}
		codeLensProvider.refresh();
	} else if (runFile) {
		// File execution - set file-level status and all tests to running
		testResultsManager.setTestResult(filePath, '__FILE__', 'running', 0, 'test');
		const testsInFile = extractTestNamesFromFile(filePath);
		logDebug(`Found ${testsInFile.length} tests in file`);
		for (const individualTest of testsInFile) {
			testResultsManager.setTestResult(filePath, individualTest, 'running', 0, 'test');
		}
		codeLensProvider.refresh();
	} else if (runSuite) {
		// Suite execution - set file-level status to running
		testResultsManager.setTestResult(filePath, '__FILE__', 'running', 0, 'test');
		codeLensProvider.refresh();
	}

	// Terminal handling - only show if configured
	if (showTerminal) {
		if (!sharedTerminal || sharedTerminal.exitStatus !== undefined) {
			sharedTerminal = vscode.window.createTerminal({
				name: 'Pest Test Runner',
				cwd: workspaceFolder.uri.fsPath
			});
			logDebug(`Created new terminal`);
		}
		sharedTerminal.show();
		const terminalCommand = `${pestBinary} ${args.join(' ')}`;
		sharedTerminal.sendText(terminalCommand);
		logDebug(`Command sent to terminal`);
	}

	// Execute with spawn for real-time streaming
	return new Promise<void>((resolve, reject) => {
		logDebug(`Executing command via spawn with streaming...`);

		// Cache for tracking test results by flowId
		const testCache = new Map<number, TeamcityResult>();
		let buffer = '';

		// Spawn options
		const spawnOptions: any = {
			cwd: workspaceFolder.uri.fsPath,
			shell: isBashOnWindows ? vscode.env.shell : true
		};

		logDebug(`Spawn options: ${JSON.stringify(spawnOptions)}`);

		const process = spawn(pestBinary, args, spawnOptions);

		process.stdout?.on('data', (data: Buffer) => {
			buffer += data.toString();
			const lines = buffer.split('\n');

			// Keep the last incomplete line in buffer
			buffer = lines.pop() || '';

			// Process each complete line
			for (const line of lines) {
				if (!line.trim()) { continue; }

				logDebug(`OUTPUT: ${line}`);

				// Try to parse as Teamcity format
				const teamcityResult = parseTeamcityLine(line);

				if (teamcityResult) {
					log(`[DEBUG parseTeamcityLine] Event: ${teamcityResult.event}, Name: ${teamcityResult.name}, LocationHint: ${teamcityResult.locationHint || 'UNDEFINED'}`);
					handleTeamcityEvent(teamcityResult, filePath, testCache);
				} else {
					// Regular output - display in output channel
					log(line);
				}
			}
		});

		process.stderr?.on('data', (data: Buffer) => {
			const error = data.toString();
			logDebug(`STDERR: ${error}`);
			log(`⚠️ ${error}`);
		});

		process.on('error', (error: Error) => {
			log(`❌ Process error: ${error.message}`);
			logDebug(`Error stack: ${error.stack}`);
			reject(error);
		});

		process.on('close', (code: number | null) => {
			logDebug(`Process exited with code: ${code}`);

			if (code === 0) {
				log(`✅ Tests completed successfully`);
			} else {
				log(`⚠️ Tests completed with exit code: ${code}`);
			}

			// Refresh UI one final time
			codeLensProvider.refresh();
			updateTestDecorations();

			// Reset execution context
			currentExecutionContext = { type: null, describesInExecution: new Set() };

			resolve();
		});
	});
}

/**
 * Handle Teamcity event and update test results in real-time
 */
function handleTeamcityEvent(
	result: TeamcityResult,
	currentFilePath: string,
	cache: Map<number, TeamcityResult>
) {
	logDebug(`Teamcity Event: ${result.event} - ${result.name || 'N/A'}`);

	// Extract test info
	log(`[DEBUG extractTestId] Input name: "${result.name}"`);
	log(`[DEBUG extractTestId] Input locationHint: "${result.locationHint || 'N/A'}"`);
	const testInfo = extractTestId(result);
	log(`[DEBUG extractTestId] Output: ${testInfo ? JSON.stringify(testInfo) : 'NULL'}`);

	if (!testInfo && result.event !== TeamcityEvent.testCount) {
		logDebug(`Could not extract test info from result`);
		return;
	}

	const flowId = result.flowId!;
	// Always use currentFilePath for consistency with CodeLens
	const testFile = currentFilePath;
	const testName = testInfo?.testName || result.name || '';

	// Extract describe name from Teamcity format: `DescribeName` → testName
	let describeName: string | undefined;
	if (result.name && result.name.includes('`') && result.name.includes('→')) {
		// Format: `Describe Name` → `Nested Describe` → test name
		// Extract the first describe name (without backticks)
		const parts = result.name.split('→');
		if (parts.length > 1) {
			describeName = parts[0].trim().replace(/`/g, '').trim();
			// Track describes found during file/suite execution
			if ((currentExecutionContext.type === 'file' || currentExecutionContext.type === 'suite') && describeName) {
				currentExecutionContext.describesInExecution.add(describeName);
			}
		}
	}

	// Force log these for debugging (not using logDebug to ensure they appear)
	log(`[handleTeamcityEvent] Test File: ${testFile}`);
	log(`[handleTeamcityEvent] Test Name: "${testName}"`);
	log(`[handleTeamcityEvent] Original Name from Teamcity: "${result.name}"`);
	log(`[handleTeamcityEvent] Extracted Name: "${testInfo?.testName || 'N/A'}"`);
	log(`[handleTeamcityEvent] Describe Name: "${describeName || 'N/A'}"`);

	switch (result.event) {
		case TeamcityEvent.testStarted:
			logResult(`▶️  Running: ${testName}`, 'running');
			testResultsManager.setTestResult(testFile, testName, 'running', result.line || 0, 'test', 0, undefined, undefined, flowId, describeName);
			cache.set(flowId, result);
			// Update UI immediately
			codeLensProvider.refresh();
			updateTestDecorations();
			break;

		case TeamcityEvent.testFinished:
			const startedTest = cache.get(flowId);
			const durationMs = result.duration || 0;
			const durationSec = durationMs / 1000; // Convert ms to seconds

			// Check if test failed (will be in cache from testFailed event)
			const failedTest = cache.get(flowId);
			if (failedTest && 'message' in failedTest) {
				// Already handled by testFailed
				logResult(`❌ Failed: ${testName} (${formatTeamcityDuration(durationMs)})`, 'failed');
			} else {
				logResult(`✅ Passed: ${testName} (${formatTeamcityDuration(durationMs)})`, 'passed');
				testResultsManager.setTestResult(testFile, testName, 'passed', result.line || 0, 'test', durationSec, undefined, undefined, flowId, describeName);
			}

			cache.delete(flowId);
			// Update UI immediately
			codeLensProvider.refresh();
			updateTestDecorations();
			break;

		case TeamcityEvent.testFailed:
			logResult(`❌ FAILED: ${testName}`, 'failed');
			log(`   Message: ${result.message || 'No message'}`);
			if (result.details) {
				// Format details nicely
				const details = result.details.split('|n').join('\n   ');
				log(`   Details:\n   ${details}`);
			}

			// Convert duration from milliseconds to seconds
			const failedDurationSec = result.duration ? result.duration / 1000 : undefined;
			testResultsManager.setTestResult(testFile, testName, 'failed', result.line || 0, 'test', failedDurationSec, result.message, result.details, flowId, describeName);

			// Store in cache for testFinished handler
			cache.set(flowId, result);

			// Update UI immediately
			codeLensProvider.refresh();
			updateTestDecorations();
			break;

		case TeamcityEvent.testIgnored:
			logResult(`🟡 SKIPPED: ${testName}`, 'skipped');
			if (result.message) {
				log(`   Reason: ${result.message}`);
			}

			testResultsManager.setTestResult(testFile, testName, 'skipped', result.line || 0, 'test', undefined, result.message, undefined, flowId, describeName);
			cache.delete(flowId);

			// Update UI immediately
			codeLensProvider.refresh();
			updateTestDecorations();
			break;

		case TeamcityEvent.testCount:
			if (result.count) {
				log(`📊 Total tests to run: ${result.count}`);
			}
			break;

		case TeamcityEvent.testSuiteStarted:
			logDebug(`Test suite started: ${result.name}`);
			// If running a describe group, mark it as running
			if (currentExecutionContext.type === 'describe' && currentExecutionContext.describeName) {
				testResultsManager.setTestResult(
					testFile,
					currentExecutionContext.describeName,
					'running',
					0,
					'describe',
					undefined,
					undefined,
					undefined,
					flowId
				);
				codeLensProvider.refresh();
			}
			break;

		case TeamcityEvent.testSuiteFinished:
			logDebug(`Test suite finished: ${result.name}`);
			// If running a describe group, calculate and store its status
			if (currentExecutionContext.type === 'describe' && currentExecutionContext.describeName) {
				const describeStatus = testResultsManager.calculateDescribeStatus(testFile, currentExecutionContext.describeName);
				testResultsManager.setTestResult(
					testFile,
					currentExecutionContext.describeName,
					describeStatus.status,
					0,
					'describe',
					describeStatus.duration,
					undefined,
					undefined,
					flowId
				);
				codeLensProvider.refresh();
				updateTestDecorations();
			}
			// If running a file or suite, update all describes that were found during execution
			else if ((currentExecutionContext.type === 'file' || currentExecutionContext.type === 'suite') &&
				currentExecutionContext.describesInExecution.size > 0) {
				for (const descName of currentExecutionContext.describesInExecution) {
					const describeStatus = testResultsManager.calculateDescribeStatus(testFile, descName);
					testResultsManager.setTestResult(
						testFile,
						descName,
						describeStatus.status,
						0,
						'describe',
						describeStatus.duration,
						undefined,
						undefined,
						flowId
					);
				}
				codeLensProvider.refresh();
				updateTestDecorations();
			}
			break;
	}
}
// XML parsing functions removed - now using Teamcity streaming format

export function deactivate() { }
