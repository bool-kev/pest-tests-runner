/**
 * Teamcity output parser for Pest test results
 * Handles real-time streaming of test results from --teamcity format
 */

export enum TeamcityEvent {
    testSuiteStarted = 'testSuiteStarted',
    testSuiteFinished = 'testSuiteFinished',
    testStarted = 'testStarted',
    testFinished = 'testFinished',
    testFailed = 'testFailed',
    testIgnored = 'testIgnored',
    testCount = 'testCount',
}

export interface TeamcityResult {
    event: TeamcityEvent;
    name?: string;
    flowId?: number;
    duration?: number;
    message?: string;
    details?: string;
    file?: string;
    line?: number;
    locationHint?: string;
    count?: number;
}

/**
 * Parse a single Teamcity format line
 * Format: ##teamcity[eventName key='value' key2='value2']
 */
export function parseTeamcityLine(line: string): TeamcityResult | null {
    // Trim the line first to remove any whitespace
    line = line.trim();

    // Match ##teamcity[...] - use greedy match and allow any content inside
    const teamcityPattern = /^##teamcity\[(\w+)(.+)\]$/;
    const match = line.match(teamcityPattern);

    if (!match) {
        return null;
    }

    const eventName = match[1];
    const attributes = match[2];

    // Parse attributes manually to handle Teamcity escaping properly
    // Teamcity escapes: |' (apostrophe), |n (newline), |r (carriage return), || (pipe), |[ |]
    const result: any = { event: eventName };

    // Parse key='value' pairs, where value can contain |' (escaped apostrophe)
    let i = 0;
    while (i < attributes.length) {
        // Skip whitespace
        while (i < attributes.length && /\s/.test(attributes[i])) {
            i++;
        }
        if (i >= attributes.length) {
            break;
        }

        // Read key
        let key = '';
        while (i < attributes.length && /\w/.test(attributes[i])) {
            key += attributes[i++];
        }

        // Skip ='
        while (i < attributes.length && (attributes[i] === '=' || attributes[i] === "'")) {
            i++;
        }

        // Read value until we find a ' that's not part of |'
        let value = '';
        while (i < attributes.length) {
            if (attributes[i] === "'") {
                // Found closing quote
                i++;
                break;
            } else if (attributes[i] === '|' && i + 1 < attributes.length) {
                // Escape sequence - include both characters
                value += attributes[i] + attributes[i + 1];
                i += 2;
            } else {
                value += attributes[i++];
            }
        }

        if (key) {
            // Unescape Teamcity special characters
            let unescapedValue: any = unescapeTeamcityValue(value);

            // Convert numeric values
            if (key === 'duration' || key === 'flowId' || key === 'count') {
                unescapedValue = parseInt(unescapedValue, 10);
            }

            result[key] = unescapedValue;
        }
    }

    // Extract file and line from locationHint if present
    if (result.locationHint) {
        const locationMatch = result.locationHint.match(/pest_qn:\/\/(.+?)::(.+)$/);
        if (locationMatch) {
            result.file = locationMatch[1];
            result.testName = locationMatch[2];
        }
    }

    // Note: Line extraction from details is now handled in extension.ts
    // where we have access to the current test file path for matching

    return result as TeamcityResult;
}

/**
 * Unescape Teamcity special characters
 * Teamcity uses |x notation for escaping
 */
function unescapeTeamcityValue(value: string): string {
    return value
        .replace(/\|n/g, '\n')
        .replace(/\|r/g, '\r')
        .replace(/\|'/g, "'")
        .replace(/\|\[/g, '[')
        .replace(/\|\]/g, ']')
        .replace(/\|\|/g, '|');
}

/**
 * Extract test ID from Teamcity result
 * Format: file.php::testName or file.php::`describe` → testName
 */
export function extractTestId(result: TeamcityResult): { file: string; testName: string } | null {
    let testName = '';
    let file = '';

    if (result.locationHint) {
        const match = result.locationHint.match(/pest_qn:\/\/(.+?)::(.+)$/);
        if (match) {
            file = match[1];
            testName = match[2];
        }
    } else if (result.file && result.name) {
        // If file was already extracted (from parsing)
        file = result.file;
        testName = result.name;
    } else if (result.name) {
        // Fallback: use name field even without file (testFinished doesn't have locationHint)
        testName = result.name;
        // file will remain empty - caller should use cached file path
    } else {
        return null;
    }

    // Extract the actual test name from Pest's hierarchical format
    // Example: "`Fonctions Helper` → `toUpperSnakeCase` → it convertit une chaîne"
    // We want: "convertit une chaîne"
    // Pattern: describe blocks are in backticks, test name comes after last →

    const originalTestName = testName;

    // Remove backticks and extract text after last arrow
    if (testName.includes('→')) {
        const parts = testName.split('→');
        const lastPart = parts[parts.length - 1].trim();

        // Remove "it " or "test " prefix if present
        testName = lastPart
            .replace(/^it\s+/, '')
            .replace(/^test\s+/, '')
            .trim();

        console.log(`[extractTestId] Original: "${originalTestName}"`);
        console.log(`[extractTestId] Extracted: "${testName}"`);
    }

    return { file, testName };
}

/**
 * Format duration from milliseconds to human-readable format
 */
export function formatDuration(durationMs: number): string {
    const seconds = durationMs / 1000;

    if (seconds < 0.01) {
        return `${seconds.toFixed(4)}s`;
    }

    if (seconds < 1) {
        return `${seconds.toFixed(3)}s`;
    }

    return `${seconds.toFixed(2)}s`;
}
