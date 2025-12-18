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
