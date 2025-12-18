/**
 * Test Result Types and Utilities
 * Centralized handling of test execution results
 */

export type TestStatus = 'passed' | 'failed' | 'running' | 'skipped' | 'none';

/**
 * Structured test result with all relevant data
 */
export interface TestResultData {
    name: string;
    status: TestStatus;
    type: 'test' | 'describe';

    // Timing
    duration?: number;        // Duration in seconds
    startTime?: number;       // Start timestamp (ms)

    // Error info (for failed tests)
    errorLine?: number;       // Line number where error occurred
    errorMessage?: string;    // Short error message
    errorDetails?: string;    // Full stack trace

    // Skip info
    skipReason?: string;      // Reason for skipping

    // Hierarchy
    describeName?: string;    // Parent describe block name

    // Teamcity tracking
    flowId?: number;
}

/**
 * Parse test name from Teamcity hierarchical format
 * Input: "`Describe Block` → `Nested` → it should do something"
 * Output: { testName: "should do something", describePath: ["Describe Block", "Nested"] }
 */
export function parseTeamcityTestName(rawName: string): { testName: string; describePath: string[] } {
    const describePath: string[] = [];
    let testName = rawName;

    if (rawName.includes('→')) {
        const parts = rawName.split('→').map(p => p.trim());

        // All parts except last are describe blocks
        for (let i = 0; i < parts.length - 1; i++) {
            // Remove backticks from describe names
            const describeName = parts[i].replace(/`/g, '').trim();
            if (describeName) {
                describePath.push(describeName);
            }
        }

        // Last part is the test name
        const lastPart = parts[parts.length - 1].trim();

        // Remove "it " or "test " prefix if present
        testName = lastPart
            .replace(/^it\s+/, '')
            .replace(/^test\s+/, '')
            .trim();
    }

    return { testName, describePath };
}

/**
 * Extract error line number from PHP stack trace
 */
export function extractErrorLineFromStackTrace(stackTrace: string, testFilePath: string): number {
    if (!stackTrace || !testFilePath) {
        return 0;
    }

    // Normalize path for comparison
    const normalizedPath = testFilePath.replace(/\\/g, '/').toLowerCase();
    const fileName = normalizedPath.split('/').pop() || '';

    // Common patterns in PHP stack traces
    const patterns = [
        /([^\s]+\.php):(\d+)/gi,              // file.php:123
        /([^\s]+\.php)\s+on\s+line\s+(\d+)/gi, // file.php on line 123
        /at\s+([^\s]+\.php):(\d+)/gi,          // at file.php:123
    ];

    // Split by Teamcity newline escape and real newlines
    const lines = stackTrace.split(/\|n|\n/);

    for (const line of lines) {
        for (const pattern of patterns) {
            pattern.lastIndex = 0; // Reset regex
            const match = pattern.exec(line);
            if (match) {
                const foundPath = match[1].replace(/\\/g, '/').toLowerCase();
                const lineNumber = parseInt(match[2], 10);

                // Check if this matches our test file
                if (foundPath.endsWith(fileName) ||
                    normalizedPath.endsWith(foundPath) ||
                    foundPath === normalizedPath) {
                    return lineNumber;
                }
            }
        }
    }

    return 0;
}

/**
 * Format duration for display
 * Optimized for readability at different scales
 */
export function formatDuration(seconds: number): string {
    if (seconds < 0.001) {
        return `${(seconds * 1000).toFixed(2)}ms`;
    }
    if (seconds < 0.01) {
        return `${seconds.toFixed(4)}s`;
    }
    if (seconds < 1) {
        return `${seconds.toFixed(3)}s`;
    }
    if (seconds < 60) {
        return `${seconds.toFixed(2)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

/**
 * Format error message for display (truncate if too long)
 */
export function formatErrorMessage(message: string, maxLength: number = 100): string {
    if (!message) {
        return 'Test failed';
    }

    // Remove newlines and excessive whitespace
    const cleaned = message.replace(/\s+/g, ' ').trim();

    if (cleaned.length <= maxLength) {
        return cleaned;
    }

    return cleaned.substring(0, maxLength - 3) + '...';
}

/**
 * Get status icon for display
 */
export function getStatusIcon(status: TestStatus): string {
    switch (status) {
        case 'passed': return '✅';
        case 'failed': return '❌';
        case 'skipped': return '🟡';
        case 'running': return '⏳';
        default: return '○';
    }
}
