import * as vscode from 'vscode';

export interface TestResult {
    name: string;
    status: 'passed' | 'failed' | 'running' | 'skipped' | 'none';
    line: number;
    type: 'test' | 'describe';
    duration?: number;
    message?: string;
}

export class TestResultsManager {
    private results: Map<string, Map<string, TestResult>> = new Map();
    private _onDidChangeResults = new vscode.EventEmitter<void>();
    public readonly onDidChangeResults = this._onDidChangeResults.event;

    public setTestResult(filePath: string, testName: string, status: TestResult['status'], line: number, type: TestResult['type'], duration?: number, message?: string) {
        if (!this.results.has(filePath)) {
            this.results.set(filePath, new Map());
        }
        const fileResults = this.results.get(filePath)!;
        const prev = fileResults.get(testName);

        const changed = !prev || prev.status !== status || prev.duration !== duration;

        if (changed) {
            console.log(`[TestResultsManager] 📝 Updating test result:`);
            console.log(`  Test: "${testName}"`);
            console.log(`  Previous Status: ${prev?.status || 'none'} → New Status: ${status}`);
            console.log(`  Duration: ${prev?.duration?.toFixed(2) || 'N/A'}s → ${duration?.toFixed(2) || 'N/A'}s`);
            console.log(`  Type: ${type}`);

            fileResults.set(testName, { name: testName, status, line, type, duration, message });
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
