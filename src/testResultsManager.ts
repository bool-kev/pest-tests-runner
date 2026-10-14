import * as vscode from 'vscode';
import { TestResultData, TestStatus, formatDuration, getStatusIcon } from './utils/testResultTypes';

/** Key used for file-level test results */
export const FILE_RESULT_KEY = '__FILE__';

export interface TestResult {
    name: string;
    status: TestStatus;
    line: number;
    type: 'test' | 'describe';
    duration?: number;
    message?: string; // Error message for failed tests, skip reason for skipped tests
    details?: string; // Stack trace and detailed error info (from Teamcity testFailed)
    flowId?: number; // Teamcity flow identifier for tracking test execution
    describeName?: string; // The describe block this test belongs to (extracted from Teamcity format)
}

/**
 * Execution summary for streaming output
 */
export interface ExecutionSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    running: number;
    totalDuration: number;
}

export class TestResultsManager {
    private results: Map<string, Map<string, TestResult>> = new Map();
    private _onDidChangeResults = new vscode.EventEmitter<void>();
    public readonly onDidChangeResults = this._onDidChangeResults.event;

    // Batch mode: accumulate changes without firing events
    private batchMode = false;
    private batchHasChanges = false;

    // Execution tracking for streaming output
    private currentExecution: {
        startTime: number;
        filePath: string;
        testStartTimes: Map<string, number>;
    } | null = null;

    /**
     * Start batch mode - changes won't fire events until endBatch() is called
     * Use this when updating multiple tests at once to avoid UI flickering
     */
    public startBatch(): void {
        this.batchMode = true;
        this.batchHasChanges = false;
    }

    /**
     * End batch mode and fire a single event if there were changes
     */
    public endBatch(): void {
        this.batchMode = false;
        if (this.batchHasChanges) {
            this.batchHasChanges = false;
            this._onDidChangeResults.fire();
        }
    }

    /**
     * Start tracking a new test execution
     */
    public startExecution(filePath: string): void {
        this.currentExecution = {
            startTime: Date.now(),
            filePath,
            testStartTimes: new Map()
        };
    }

    /**
     * Mark a test as started (for duration tracking)
     */
    public markTestStarted(testName: string): void {
        if (this.currentExecution) {
            this.currentExecution.testStartTimes.set(testName, Date.now());
        }
    }

    /**
     * Get the start time for a test (for calculating duration if not provided)
     */
    public getTestStartTime(testName: string): number | undefined {
        return this.currentExecution?.testStartTimes.get(testName);
    }

    /**
     * End execution tracking and return summary
     */
    public endExecution(): ExecutionSummary | null {
        if (!this.currentExecution) {
            return null;
        }

        const summary = this.getExecutionSummary(this.currentExecution.filePath);
        summary.totalDuration = (Date.now() - this.currentExecution.startTime) / 1000;

        this.currentExecution = null;
        return summary;
    }

    /**
     * Get execution summary for a file
     */
    public getExecutionSummary(filePath: string): ExecutionSummary {
        const results = this.getAllResultsForFile(filePath);
        const tests = results.filter(r => r.type === 'test');

        return {
            total: tests.length,
            passed: tests.filter(t => t.status === 'passed').length,
            failed: tests.filter(t => t.status === 'failed').length,
            skipped: tests.filter(t => t.status === 'skipped').length,
            running: tests.filter(t => t.status === 'running').length,
            totalDuration: tests.reduce((sum, t) => sum + (t.duration || 0), 0)
        };
    }

    /**
     * Format execution summary for output display
     */
    public formatSummary(summary: ExecutionSummary): string {
        const parts: string[] = [];

        if (summary.passed > 0) {
            parts.push(`${getStatusIcon('passed')} ${summary.passed} passed`);
        }
        if (summary.failed > 0) {
            parts.push(`${getStatusIcon('failed')} ${summary.failed} failed`);
        }
        if (summary.skipped > 0) {
            parts.push(`${getStatusIcon('skipped')} ${summary.skipped} skipped`);
        }

        const statusLine = parts.join(' | ') || 'No tests executed';
        const timeLine = `⏱️ Total time: ${formatDuration(summary.totalDuration)}`;

        return `\n${'─'.repeat(50)}\n${statusLine}\n${timeLine}\n${'─'.repeat(50)}`;
    }

    /**
     * Set test result with improved API using partial data object
     */
    public setResult(filePath: string, data: Partial<TestResultData> & { name: string }): void {
        if (!this.results.has(filePath)) {
            this.results.set(filePath, new Map());
        }
        const fileResults = this.results.get(filePath)!;
        const prev = fileResults.get(data.name);

        // Calculate duration from start time if not provided
        let duration = data.duration;
        if (duration === undefined && data.status !== 'running' && this.currentExecution) {
            const startTime = this.currentExecution.testStartTimes.get(data.name);
            if (startTime) {
                duration = (Date.now() - startTime) / 1000;
            }
        }

        const newResult: TestResult = {
            name: data.name,
            status: data.status || prev?.status || 'none',
            line: data.errorLine || prev?.line || 0,
            type: data.type || prev?.type || 'test',
            duration: duration ?? prev?.duration,
            message: data.errorMessage || data.skipReason || prev?.message,
            details: data.errorDetails || prev?.details,
            flowId: data.flowId ?? prev?.flowId,
            describeName: data.describeName || prev?.describeName
        };

        const changed = !prev ||
            prev.status !== newResult.status ||
            prev.duration !== newResult.duration ||
            prev.message !== newResult.message;

        if (changed) {
            fileResults.set(data.name, newResult);

            if (this.batchMode) {
                this.batchHasChanges = true;
            } else {
                this._onDidChangeResults.fire();
            }
        }
    }

    public setTestResult(
        filePath: string,
        testName: string,
        status: TestResult['status'],
        line: number,
        type: TestResult['type'],
        duration?: number,
        message?: string,
        details?: string,
        flowId?: number,
        describeName?: string
    ) {
        // Delegate to new API for backward compatibility
        this.setResult(filePath, {
            name: testName,
            status,
            errorLine: line,
            type,
            duration,
            errorMessage: message,
            errorDetails: details,
            flowId,
            describeName
        });
    }

    public getTestResult(filePath: string, testName: string): TestResult | undefined {
        return this.results.get(filePath)?.get(testName);
    }

    public getAllResultsForFile(filePath: string): TestResult[] {
        const fileResults = this.results.get(filePath);
        return fileResults ? Array.from(fileResults.values()) : [];
    }

    /**
     * Get or calculate the status of a describe block
     * If the describe has been explicitly tested, return its stored status
     * Otherwise, return undefined (don't calculate from child tests)
     */
    public getDescribeStatus(filePath: string, describeName: string): TestResult | undefined {
        // First check if this describe has an explicit stored result
        const storedResult = this.getTestResult(filePath, describeName);
        if (storedResult && storedResult.type === 'describe') {
            return storedResult;
        }

        // Don't calculate status from child tests - only show status if describe was explicitly run
        return undefined;
    }

    /**
     * Calculate aggregate status for a describe based on all its child tests
     * Used when running a describe group or full file
     */
    public calculateDescribeStatus(filePath: string, describeName: string): TestResult {
        const fileResults = this.results.get(filePath);

        // Find all tests that belong to this describe block
        const testsInDescribe = fileResults ? Array.from(fileResults.values()).filter(test =>
            test.type === 'test' && test.describeName === describeName
        ) : [];

        // Calculate aggregate status:
        // - If any test is running → describe is running
        // - If all tests passed → describe passed
        // - If any test failed → describe failed
        // - If any test skipped and none failed → describe skipped

        const hasRunning = testsInDescribe.some(test => test.status === 'running');
        const hasFailed = testsInDescribe.some(test => test.status === 'failed');
        const hasSkipped = testsInDescribe.some(test => test.status === 'skipped');
        const allPassed = testsInDescribe.length > 0 && testsInDescribe.every(test => test.status === 'passed');

        let status: TestResult['status'] = 'none';
        if (hasRunning) {
            status = 'running';
        } else if (hasFailed) {
            status = 'failed';
        } else if (allPassed) {
            status = 'passed';
        } else if (hasSkipped) {
            status = 'skipped';
        }

        // Calculate total duration
        const totalDuration = testsInDescribe.reduce((sum, test) => sum + (test.duration || 0), 0);

        return {
            name: describeName,
            status,
            line: 0,
            type: 'describe',
            duration: totalDuration > 0 ? totalDuration : undefined
        };
    }

    /**
     * Finalize group statuses (describe blocks and file) based on individual test results
     * Call this at the end of test execution to update running statuses to their final state
     */
    public finalizeGroupStatuses(filePath: string, describes: Set<string>, includeFile: boolean): void {
        if (!this.results.has(filePath)) {
            return;
        }

        const fileResults = this.results.get(filePath)!;

        // Finalize each describe block
        for (const describeName of describes) {
            const calculatedStatus = this.calculateDescribeStatus(filePath, describeName);

            // Update the describe result
            fileResults.set(describeName, {
                ...calculatedStatus,
                type: 'describe'
            });
        }

        // Finalize __FILE__ if needed
        if (includeFile) {
            const allTests = Array.from(fileResults.values()).filter(r => r.type === 'test' && r.name !== FILE_RESULT_KEY);

            const hasRunning = allTests.some(t => t.status === 'running');
            const hasFailed = allTests.some(t => t.status === 'failed');
            const hasSkipped = allTests.some(t => t.status === 'skipped');
            const allPassed = allTests.length > 0 && allTests.every(t => t.status === 'passed');

            let fileStatus: TestResult['status'] = 'none';
            if (hasRunning) {
                fileStatus = 'running';
            } else if (hasFailed) {
                fileStatus = 'failed';
            } else if (allPassed) {
                fileStatus = 'passed';
            } else if (hasSkipped) {
                fileStatus = 'skipped';
            }

            const totalDuration = allTests.reduce((sum, t) => sum + (t.duration || 0), 0);

            fileResults.set(FILE_RESULT_KEY, {
                name: FILE_RESULT_KEY,
                status: fileStatus,
                line: 0,
                type: 'test',
                duration: totalDuration > 0 ? totalDuration : undefined
            });
        }

        this._onDidChangeResults.fire();
    }

    public clearFileResults(filePath: string) {
        if (this.results.has(filePath)) {
            this.results.delete(filePath);
            this._onDidChangeResults.fire();
        }
    }

    public clearAllResults() {
        if (this.results.size > 0) {
            this.results.clear();
            this._onDidChangeResults.fire();
        }
    }
}
