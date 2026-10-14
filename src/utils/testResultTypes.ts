/**
 * Test Result Types and Utilities
 * Centralized handling of test execution results
 */

export type TestStatus = 'passed' | 'failed' | 'errored' | 'running' | 'queued' | 'skipped' | 'none';

/**
 * Extract error line number from PHP stack trace
 *
 * Pest prints frames relative to the project root ("at tests\Unit\FooTest.php:12"), while
 * plain PHP errors use absolute paths, possibly from inside a container ("/var/www/html/tests/...").
 * A frame matches when its path and the test file path share the same trailing segments,
 * so the frame with the longest common suffix wins (first one on ties).
 */
export function extractErrorLineFromStackTrace(stackTrace: string, testFilePath: string): number {
    if (!stackTrace || !testFilePath) {
        return 0;
    }

    const testSegments = splitPath(testFilePath);

    // Common patterns in PHP stack traces
    const patterns = [
        /([^\s'"()]+\.php):(\d+)/gi,             // file.php:123
        /([^\s'"()]+\.php)\s+on\s+line\s+(\d+)/gi, // file.php on line 123
        /([^\s'"()]+\.php)\((\d+)\)/gi,          // file.php(123) - PHP exception traces
    ];

    let bestLine = 0;
    let bestScore = 0;

    // Split by Teamcity newline escape and real newlines
    for (const line of stackTrace.split(/\|n|\r?\n/)) {
        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(line)) !== null) {
                const score = commonSuffixLength(splitPath(match[1]), testSegments);
                if (score > bestScore) {
                    bestScore = score;
                    bestLine = parseInt(match[2], 10);
                }
            }
        }
    }

    return bestLine;
}

function splitPath(filePath: string): string[] {
    return filePath.replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean);
}

function commonSuffixLength(a: string[], b: string[]): number {
    let count = 0;
    while (count < a.length && count < b.length && a[a.length - 1 - count] === b[b.length - 1 - count]) {
        count++;
    }
    return count;
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
        case 'errored': return '❌';
        case 'skipped': return '🟡';
        case 'running': return '⏳';
        case 'queued': return '⏳';
        default: return '○';
    }
}
