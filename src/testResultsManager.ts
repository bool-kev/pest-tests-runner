import * as vscode from 'vscode';

export interface TestResult {
    name: string;
    status: 'passed' | 'failed' | 'running' | 'skipped' | 'none';
    line: number;
    type: 'test' | 'describe';
    duration?: number;
    message?: string; // Error message for failed tests, skip reason for skipped tests
    details?: string; // Stack trace and detailed error info (from Teamcity testFailed)
    flowId?: number; // Teamcity flow identifier for tracking test execution
    describeName?: string; // The describe block this test belongs to (extracted from Teamcity format)
}

export class TestResultsManager {
    private results: Map<string, Map<string, TestResult>> = new Map();
    private _onDidChangeResults = new vscode.EventEmitter<void>();
    public readonly onDidChangeResults = this._onDidChangeResults.event;

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
        if (!this.results.has(filePath)) {
            this.results.set(filePath, new Map());
        }
        const fileResults = this.results.get(filePath)!;
        const prev = fileResults.get(testName);

        const changed = !prev || prev.status !== status || prev.duration !== duration || prev.message !== message;

        if (changed) {
            console.log(`[TestResultsManager] 📝 Updating test result:`);
            console.log(`  Test: "${testName}"`);
            console.log(`  Previous Status: ${prev?.status || 'none'} → New Status: ${status}`);
            console.log(`  Duration: ${prev?.duration?.toFixed(4) || 'N/A'}s → ${duration?.toFixed(4) || 'N/A'}s`);
            console.log(`  Type: ${type}`);
            if (message) {
                console.log(`  Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
            }
            if (details) {
                console.log(`  Details: ${details.substring(0, 100)}${details.length > 100 ? '...' : ''}`);
            }

            fileResults.set(testName, {
                name: testName,
                status,
                line,
                type,
                duration,
                message,
                details,
                flowId,
                describeName
            });
            this._onDidChangeResults.fire();

            console.log(`  ✅ Results updated and event fired`);
        } else {
            console.log(`[TestResultsManager] ⏭️ No change for "${testName}" (status: ${status})`);
        }
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
