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
    testStdOut = 'testStdOut',
    testStdErr = 'testStdErr',
}

export interface TeamcityResult {
    event: TeamcityEvent;
    name?: string;
    flowId?: number;
    duration?: number;
    message?: string;
    details?: string;
    /** File part of locationHint, relative to the project root as printed by Pest (may use `\` on Windows) */
    file?: string;
    /** Description part of locationHint (full Pest description, including any dataset suffix) */
    description?: string;
    line?: number;
    locationHint?: string;
    count?: number;
    /** `comparisonFailure` when Pest provides expected/actual values */
    type?: string;
    expected?: string;
    actual?: string;
    /** Output of testStdOut / testStdErr */
    out?: string;
}

const LOCATION_PREFIX = 'pest_qn://';
const DATASET_SEPARATOR = ' with data set ';
const NUMERIC_KEYS = new Set(['duration', 'flowId', 'count']);
const UNESCAPES: Record<string, string> = { n: '\n', r: '\r', "'": "'", '[': '[', ']': ']', '|': '|' };

/**
 * Parse a single Teamcity format line
 * Format: ##teamcity[eventName key='value' key2='value2']
 */
export function parseTeamcityLine(line: string): TeamcityResult | null {
    line = line.trim();

    const match = /^##teamcity\[(\w+)(.*)\]$/.exec(line);
    if (!match) {
        return null;
    }

    const result: Record<string, unknown> = { event: match[1] };
    const attributes = match[2];

    // Parse key='value' pairs; values may contain Teamcity escapes (|', |n, ||, |[, |])
    let i = 0;
    while (i < attributes.length) {
        while (i < attributes.length && /\s/.test(attributes[i])) {
            i++;
        }
        if (i >= attributes.length) {
            break;
        }

        let key = '';
        while (i < attributes.length && /\w/.test(attributes[i])) {
            key += attributes[i++];
        }

        // Skip ='
        while (i < attributes.length && (attributes[i] === '=' || attributes[i] === "'")) {
            i++;
        }

        // Read value until the closing quote, keeping escape sequences intact
        let value = '';
        while (i < attributes.length) {
            if (attributes[i] === "'") {
                i++;
                break;
            } else if (attributes[i] === '|' && i + 1 < attributes.length) {
                value += attributes[i] + attributes[i + 1];
                i += 2;
            } else {
                value += attributes[i++];
            }
        }

        if (key) {
            const unescaped = unescapeTeamcityValue(value);
            result[key] = NUMERIC_KEYS.has(key) ? parseInt(unescaped, 10) : unescaped;
        }
    }

    // locationHint: pest_qn://<relative file>::<description>
    // The description itself may contain "::", so split on the first occurrence only.
    const hint = result.locationHint;
    if (typeof hint === 'string' && hint.startsWith(LOCATION_PREFIX)) {
        const location = hint.slice(LOCATION_PREFIX.length);
        const separator = location.indexOf('::');
        if (separator === -1) {
            result.file = location;
        } else {
            result.file = location.slice(0, separator);
            result.description = location.slice(separator + 2);
        }
    }

    return result as unknown as TeamcityResult;
}

/**
 * Strip the dataset suffix Pest appends to test descriptions
 * e.g. 'it adds with data set "(1, 2)"' -> 'it adds'
 */
export function stripDatasetSuffix(description: string): string {
    // Same rule as Pest's Converter (Str::beforeLast)
    const index = description.lastIndexOf(DATASET_SEPARATOR);
    return index === -1 ? description : description.slice(0, index);
}

/**
 * Unescape Teamcity special characters in a single pass
 * (a multi-pass replace would turn "||n" into "|" + newline)
 */
function unescapeTeamcityValue(value: string): string {
    return value.replace(/\|(.)/g, (whole, char: string) => UNESCAPES[char] ?? whole);
}
