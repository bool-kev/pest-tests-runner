import * as vscode from 'vscode';
import { PestCodeLensProvider } from './pestCodeLensProvider';
import { TestResultsManager } from './testResultsManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { XMLParser } from 'fast-xml-parser';

const execAsync = promisify(exec);

let testResultsManager: TestResultsManager;
let codeLensProvider: PestCodeLensProvider;
let sharedTerminal: vscode.Terminal | undefined;
let outputChannel: vscode.OutputChannel;

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
						statusText = `❌ ${formatDuration(result.duration || 0)}`;
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
				}

				if (decorationArray) {
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

function logSummary(passed: number, failed: number, skipped: number, totalDuration: number) {
	outputChannel.appendLine('');
	outputChannel.appendLine('═══════════════════════════════════════════════');
	outputChannel.appendLine('                TEST SUMMARY                   ');
	outputChannel.appendLine('═══════════════════════════════════════════════');
	outputChannel.appendLine(`  ✅ Passed:  ${passed}`);
	outputChannel.appendLine(`  ❌ Failed:  ${failed}`);
	outputChannel.appendLine(`  🟡 Skipped: ${skipped}`);
	outputChannel.appendLine(`  ⏱️  Total:   ${(passed + failed + skipped)} tests in ${formatDuration(totalDuration)}`);
	outputChannel.appendLine('═══════════════════════════════════════════════');

	if (failed > 0) {
		outputChannel.appendLine('❌ TESTS FAILED');
	} else if (passed > 0) {
		outputChannel.appendLine('✅ ALL TESTS PASSED');
	}
	outputChannel.appendLine('');
}

/**
 * Extract the individual test name from a Pest XML testcase name
 * Format: "`Group` → `SubGroup` → it description" or "it description"
 * Returns: "description"
 */
function extractTestNameFromXml(fullName: string): string {
	// Split by the arrow separator
	const parts = fullName.split('→').map(p => p.trim());
	let testName = parts[parts.length - 1]; // Get last part

	// Remove "it " prefix if present
	if (testName.startsWith('it ')) {
		testName = testName.substring(3);
	}

	// Remove backticks if present
	testName = testName.replace(/`/g, '');

	return testName.trim();
}

/**
 * Extract failure/error message from a testcase
 */
function extractErrorMessage(tc: any): string | undefined {
	if (tc.failure) {
		if (typeof tc.failure === 'string') {
			return tc.failure;
		}
		if (tc.failure['@_message']) {
			return tc.failure['@_message'];
		}
		if (tc.failure['#text']) {
			return tc.failure['#text'];
		}
	}

	if (tc.error) {
		if (typeof tc.error === 'string') {
			return tc.error;
		}
		if (tc.error['@_message']) {
			return tc.error['@_message'];
		}
		if (tc.error['#text']) {
			return tc.error['#text'];
		}
	}

	return undefined;
}

/**
 * Determine the status of a testcase
 */
function getTestStatus(tc: any): 'passed' | 'failed' | 'skipped' {
	if (tc.failure || tc.error) {
		return 'failed';
	}
	// Check for skipped tests - Pest/PHPUnit can mark them in different ways
	if (tc.skipped || tc['@_skipped'] || tc.skipped === '' || tc['skipped']) {
		return 'skipped';
	}
	return 'passed';
}

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
		const lines = content.split('\n');

		for (const line of lines) {
			// Match test() or it() calls with proper quote handling
			// (?:[^'"`\\]|\\.)* matches either non-quote/non-backslash chars OR escaped chars
			const testMatch = line.match(/^\s*(test|it)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*)\2/);
			if (testMatch) {
				const rawName = testMatch[3];
				const decodedName = decodeTestName(rawName);
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
 */
function extractTestNamesFromDescribe(filePath: string, describeName: string): string[] {
	const testNames: string[] = [];

	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const lines = content.split('\n');

		let inDescribeBlock = false;
		let braceDepth = 0;
		let describeStartDepth = 0;

		for (const line of lines) {
			// Check if we're entering the target describe block
			const describeMatch = line.match(/^\s*describe\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*)\1/);
			if (describeMatch) {
				const rawDescribeName = describeMatch[2];
				const decodedDescribeName = decodeTestName(rawDescribeName);
				if (decodedDescribeName === describeName) {
					inDescribeBlock = true;
					describeStartDepth = braceDepth;
				}
			}

			// Count braces to track depth
			const openBraces = (line.match(/{/g) || []).length;
			const closeBraces = (line.match(/}/g) || []).length;
			braceDepth += openBraces - closeBraces;

			// If we're in the describe block, extract test names
			if (inDescribeBlock) {
				const testMatch = line.match(/^\s*(test|it)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*)\2/);
				if (testMatch) {
					const rawTestName = testMatch[3];
					const decodedTestName = decodeTestName(rawTestName);
					testNames.push(decodedTestName);
				}

				// Exit the describe block when we return to the starting depth
				if (braceDepth <= describeStartDepth && openBraces === 0 && closeBraces > 0) {
					break;
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

	const tempDir = os.tmpdir();
	const junitFile = path.join(tempDir, `pest-results-${Date.now()}.xml`);

	logDebug(`File Path: ${filePath}`);
	logDebug(`File Path for Command: ${filePathForCommand}`);
	logDebug(`Platform: ${process.platform}`);
	logDebug(`Shell: ${vscode.env.shell}`);
	logDebug(`Is Bash on Windows: ${isBashOnWindows}`);
	logDebug(`Pest Binary: ${pestBinary}`);
	logDebug(`JUnit File: ${junitFile}`);

	let command = '';
	if (runSuite) {
		command = `${pestBinary} --log-junit "${junitFile}"`;
	} else if (runFile) {
		command = `${pestBinary} "${filePathForCommand}" --log-junit "${junitFile}"`;
	} else if (testName) {
		// Escape the test name to handle apostrophes, backslashes, and other special characters
		const escapedTestName = escapeTestName(testName);
		command = `${pestBinary} "${filePathForCommand}" --filter "${escapedTestName}" --log-junit "${junitFile}"`;
	}

	logDebug(`Command: ${command}`);

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
		sharedTerminal.sendText(command);
		logDebug(`Command sent to terminal`);
	}

	try {
		logDebug(`Executing command via exec...`);

		// On Windows with bash, we need to use bash explicitly
		const execOptions: any = {
			cwd: workspaceFolder.uri.fsPath,
			maxBuffer: 1024 * 1024 * 10
		};

		// If using bash on Windows, specify bash as the shell
		if (isBashOnWindows) {
			execOptions.shell = vscode.env.shell;
			logDebug(`Using shell: ${execOptions.shell}`);
		}

		const { stdout, stderr } = await execAsync(command, execOptions);
		logDebug(`Command executed successfully`);
		if (stdout) {
			const stdoutStr = stdout.toString();
			logDebug(`STDOUT: ${stdoutStr.substring(0, 200)}...`);
		}
		if (stderr) {
			const stderrStr = stderr.toString();
			logDebug(`STDERR: ${stderrStr.substring(0, 200)}...`);
		}

		// Wait a bit for the file to be written
		logDebug(`Waiting 200ms for XML file to be written...`);
		await new Promise(resolve => setTimeout(resolve, 200));

		logDebug(`Checking if JUnit file exists...`);
		if (fs.existsSync(junitFile)) {
			logDebug(`JUnit file found!`);
			const xmlContent = fs.readFileSync(junitFile, 'utf-8');
			const fileSize = xmlContent.length;
			logDebug(`JUnit file size: ${fileSize} bytes`);
			logDebug(`First 300 chars of XML:\n${xmlContent.substring(0, 300)}...`);
			logDebug(`Starting XML parsing...`);
			await parseJUnitResults(xmlContent, filePath, testName, type, testResultsManager);
			fs.unlinkSync(junitFile);
			logDebug(`JUnit file deleted`);
		} else {
			log(`⚠️ JUnit file NOT FOUND`);
			logDebug(`JUnit file path: ${junitFile}`);
			if (testName && (type === 'test' || type === 'describe')) {
				logResult(`No results file - assuming passed`, 'passed');
				testResultsManager.setTestResult(filePath, testName, 'passed', 0, type);
			}
		}
	} catch (error: any) {
		log(`❌ Test execution failed: ${error.message}`);
		logDebug(`Error stack: ${error.stack?.substring(0, 200)}`);

		// Wait a bit for the file to be written even on error
		logDebug(`Waiting 200ms for XML file (after error)...`);
		await new Promise(resolve => setTimeout(resolve, 200));

		logDebug(`Checking if JUnit file exists (after error)...`);
		if (fs.existsSync(junitFile)) {
			try {
				logDebug(`JUnit file found after error!`);
				const xmlContent = fs.readFileSync(junitFile, 'utf-8');
				const fileSize = xmlContent.length;
				logDebug(`JUnit file size: ${fileSize} bytes`);
				logDebug(`First 300 chars of XML:\n${xmlContent.substring(0, 300)}...`);
				logDebug(`Starting XML parsing (after error)...`);
				await parseJUnitResults(xmlContent, filePath, testName, type, testResultsManager);
				fs.unlinkSync(junitFile);
				logDebug(`JUnit file deleted`);
			} catch (parseError: any) {
				log(`❌ Failed to parse JUnit file: ${parseError.message}`);
				if (testName && (type === 'test' || type === 'describe')) {
					logResult(`Parse error - marking as failed`, 'failed');
					testResultsManager.setTestResult(filePath, testName, 'failed', 0, type);
				}
			}
		} else {
			logDebug(`JUnit file NOT FOUND after error at: ${junitFile}`);
			if (testName && (type === 'test' || type === 'describe')) {
				logResult(`No results file after error - marking as failed`, 'failed');
				testResultsManager.setTestResult(filePath, testName, 'failed', 0, type);
			}
		}
	}
}


export async function parseJUnitResults(
	xmlContent: string,
	filePath: string,
	testName: string,
	type: 'test' | 'describe' | 'file' | 'suite',
	testResultsManager: TestResultsManager
) {
	logDebug(`Parsing XML for ${type}: "${testName}"`);

	const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
	const parsed = parser.parse(xmlContent);

	if (!parsed.testsuites) {
		log(`❌ No test results found in XML`);
		return;
	}

	const suites = Array.isArray(parsed.testsuites.testsuite)
		? parsed.testsuites.testsuite
		: [parsed.testsuites.testsuite].filter(Boolean);

	logDebug(`Found ${suites.length} test suite(s)`);

	// For 'file' or 'suite' type, update all tests in the file
	if (type === 'file' || type === 'suite') {
		logDebug(`Processing ${type === 'file' ? 'FILE' : 'SUITE'} - updating all tests`);

		let passedCount = 0;
		let failedCount = 0;
		let skippedCount = 0;
		let totalDuration = 0;

		for (const suite of suites) {
			const cases = Array.isArray(suite.testcase)
				? suite.testcase
				: [suite.testcase].filter(Boolean);

			logDebug(`Suite has ${cases.length} test case(s)`);

			for (const tc of cases) {
				if (!tc['@_name']) {
					continue;
				}

				const tcName = tc['@_name'];
				const duration = parseFloat(tc['@_time'] ?? 0);
				const individualTestName = extractTestNameFromXml(tcName);
				const message = extractErrorMessage(tc);
				const status = getTestStatus(tc);

				// Count results
				if (status === 'passed') {
					passedCount++;
				} else if (status === 'failed') {
					failedCount++;
				} else if (status === 'skipped') {
					skippedCount++;
				}
				totalDuration += duration;

				// Update the test result
				testResultsManager.setTestResult(filePath, individualTestName, status, 0, 'test', duration, message);
				logResult(`Test "${individualTestName}" → ${status.toUpperCase()} (${formatDuration(duration)})`, status);
			}
		}

		logDebug(`Updated all tests in ${type}`);
		logSummary(passedCount, failedCount, skippedCount, totalDuration);

		// Update file-level status based on results
		if (type === 'file' || type === 'suite') {
			const fileStatus = failedCount > 0 ? 'failed' : (skippedCount > 0 && passedCount === 0) ? 'skipped' : 'passed';
			testResultsManager.setTestResult(filePath, '__FILE__', fileStatus, 0, 'test', totalDuration);
			logDebug(`File-level status set to: ${fileStatus}`);
		}

		return;
	}

	if (!testName || (type !== 'test' && type !== 'describe')) {
		logDebug(`Parsing skipped: no testName or invalid type (${type})`);
		return;
	}

	// For Pest tests, the name format in XML is: "`Group` → `SubGroup` → it description"
	// We need to match based on the test description part
	const escapedTestName = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	if (type === 'test') {
		let found = false;

		for (const suite of suites) {
			const cases = Array.isArray(suite.testcase)
				? suite.testcase
				: [suite.testcase].filter(Boolean);

			logDebug(`Suite has ${cases.length} test case(s)`);

			for (const tc of cases) {
				if (!tc['@_name']) {
					continue;
				}

				const tcName = tc['@_name'];
				logDebug(`Checking: "${tcName}"`);

				// Match if the test name appears anywhere in the XML name
				// This handles Pest's format: "`Group` → `SubGroup` → it description"
				if (tcName.includes(testName) || tcName.endsWith(testName)) {
					found = true;
					const duration = parseFloat(tc['@_time'] ?? 0);
					const message = extractErrorMessage(tc);
					const status = getTestStatus(tc);

					testResultsManager.setTestResult(filePath, testName, status, 0, type, duration, message);
					logResult(`Test "${testName}" ${status.toUpperCase()} (${formatDuration(duration)})`, status);

					break;
				}
			}
			if (found) {
				break;
			}
		}

		if (!found) {
			log(`⚠️ Test "${testName}" not found in results`);
			logDebug(`This could mean the test name doesn't match any testcase in the XML`);
			testResultsManager.setTestResult(filePath, testName, 'none', 0, type);
		}
	}

	if (type === 'describe') {
		logDebug(`Processing DESCRIBE group: "${testName}"`);
		// For describe groups, collect all testcases that start with the group name
		// Pest format: "`GroupName` → `SubGroup` → it description"
		const describeCases: any[] = [];

		for (const suite of suites) {
			const cases = Array.isArray(suite.testcase)
				? suite.testcase
				: [suite.testcase].filter(Boolean);

			for (const tc of cases) {
				if (!tc['@_name']) {
					continue;
				}

				const tcName = tc['@_name'];
				// Match if the describe name appears at the start of the test name
				if (tcName.includes(`\`${testName}\``)) {
					describeCases.push(tc);
					logDebug(`Matched to group: "${tcName}"`);
				}
			}
		}

		if (describeCases.length > 0) {
			logDebug(`Found ${describeCases.length} test(s) in describe group`);

			// Update each individual test in the group
			for (const tc of describeCases) {
				const tcName = tc['@_name'];
				const duration = parseFloat(tc['@_time'] ?? 0);
				const individualTestName = extractTestNameFromXml(tcName);
				const message = extractErrorMessage(tc);
				const status = getTestStatus(tc);

				// Update the individual test result
				testResultsManager.setTestResult(filePath, individualTestName, status, 0, 'test', duration, message);
				logResult(`Individual test "${individualTestName}" → ${status.toUpperCase()} (${formatDuration(duration)})`, status);
			}

			// Calculate group status
			const anyFailed = describeCases.some(tc => tc.failure || tc.error);
			const anySkipped = describeCases.some(tc => tc.skipped);
			const allSkipped = describeCases.every(tc => tc.skipped);
			const duration = describeCases.reduce((sum, tc) => sum + parseFloat(tc['@_time'] ?? 0), 0);

			logDebug(`Any Failed: ${anyFailed}, Any Skipped: ${anySkipped}, All Skipped: ${allSkipped}`);

			let status: 'passed' | 'failed' | 'skipped';
			if (anyFailed) {
				status = 'failed';
			} else if (anySkipped && allSkipped) {
				status = 'skipped';
			} else {
				status = 'passed';
			}

			logDebug(`Final Group Status: ${status}`);
			testResultsManager.setTestResult(filePath, testName, status, 0, type, duration);
			logResult(`Describe group "${testName}" ${status.toUpperCase()} (${describeCases.length} tests, ${formatDuration(duration)})`, status);
		} else {
			log(`⚠️ Describe group "${testName}" not found in results`);
			logDebug(`This could mean the group name doesn't match any testcase in the XML`);
			testResultsManager.setTestResult(filePath, testName, 'none', 0, type);
		}
	}
}
export function deactivate() { }
