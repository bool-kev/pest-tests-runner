import * as assert from 'assert';
import {
    parseTeamcityTestName,
    extractErrorLineFromStackTrace,
    formatDuration,
    formatErrorMessage,
    formatStackTraceForHover,
    getStatusIcon,
    getStatusThemeColor,
    TestStatus
} from '../utils/testResultTypes';

suite('Test Result Types Test Suite', () => {

    suite('parseTeamcityTestName', () => {
        test('parses simple test name without hierarchy', () => {
            const result = parseTeamcityTestName('simple test');
            assert.strictEqual(result.testName, 'simple test');
            assert.deepStrictEqual(result.describePath, []);
        });

        test('parses test with single describe block', () => {
            const result = parseTeamcityTestName('`Describe Block` → it should work');
            assert.strictEqual(result.testName, 'should work');
            assert.deepStrictEqual(result.describePath, ['Describe Block']);
        });

        test('parses test with nested describe blocks', () => {
            const result = parseTeamcityTestName('`Outer` → `Inner` → it does something');
            assert.strictEqual(result.testName, 'does something');
            assert.deepStrictEqual(result.describePath, ['Outer', 'Inner']);
        });

        test('handles test prefix removal', () => {
            const result = parseTeamcityTestName('`Group` → test my test name');
            assert.strictEqual(result.testName, 'my test name');
        });

        test('handles it prefix removal', () => {
            const result = parseTeamcityTestName('`Group` → it should do something');
            assert.strictEqual(result.testName, 'should do something');
        });
    });

    suite('extractErrorLineFromStackTrace', () => {
        test('extracts line from standard PHP format', () => {
            const stack = '/path/to/TestFile.php:42';
            const line = extractErrorLineFromStackTrace(stack, '/path/to/TestFile.php');
            assert.strictEqual(line, 42);
        });

        test('extracts line from "on line" format', () => {
            const stack = '/path/to/TestFile.php on line 123';
            const line = extractErrorLineFromStackTrace(stack, '/path/to/TestFile.php');
            assert.strictEqual(line, 123);
        });

        test('extracts line from "at" format', () => {
            const stack = 'at /path/to/TestFile.php:55';
            const line = extractErrorLineFromStackTrace(stack, '/path/to/TestFile.php');
            assert.strictEqual(line, 55);
        });

        test('handles Teamcity newline escapes', () => {
            const stack = 'some error|n/path/to/TestFile.php:99|nmore trace';
            const line = extractErrorLineFromStackTrace(stack, '/path/to/TestFile.php');
            assert.strictEqual(line, 99);
        });

        test('matches by filename only', () => {
            const stack = 'C:\\Users\\test\\project\\TestFile.php:77';
            const line = extractErrorLineFromStackTrace(stack, '/var/www/project/TestFile.php');
            assert.strictEqual(line, 77);
        });

        test('returns 0 for empty stack trace', () => {
            const line = extractErrorLineFromStackTrace('', '/path/to/TestFile.php');
            assert.strictEqual(line, 0);
        });

        test('returns 0 for empty test file path', () => {
            const line = extractErrorLineFromStackTrace('TestFile.php:42', '');
            assert.strictEqual(line, 0);
        });

        test('returns 0 when file not found in stack', () => {
            const stack = 'OtherFile.php:42';
            const line = extractErrorLineFromStackTrace(stack, '/path/to/TestFile.php');
            assert.strictEqual(line, 0);
        });
    });

    suite('formatDuration', () => {
        test('formats sub-millisecond as ms', () => {
            assert.strictEqual(formatDuration(0.0005), '0.50ms');
        });

        test('formats very small seconds with 4 decimals', () => {
            assert.strictEqual(formatDuration(0.005), '0.0050s');
        });

        test('formats sub-second with 3 decimals', () => {
            assert.strictEqual(formatDuration(0.123), '0.123s');
        });

        test('formats seconds with 2 decimals', () => {
            assert.strictEqual(formatDuration(5.678), '5.68s');
        });

        test('formats minutes and seconds', () => {
            assert.strictEqual(formatDuration(125.5), '2m 5.5s');
        });

        test('handles zero', () => {
            assert.strictEqual(formatDuration(0), '0.00ms');
        });
    });

    suite('formatErrorMessage', () => {
        test('returns default message for empty input', () => {
            assert.strictEqual(formatErrorMessage(''), 'Test failed');
        });

        test('preserves short messages', () => {
            assert.strictEqual(formatErrorMessage('Short error'), 'Short error');
        });

        test('truncates long messages', () => {
            const longMessage = 'A'.repeat(150);
            const result = formatErrorMessage(longMessage, 100);
            assert.strictEqual(result.length, 100);
            assert.ok(result.endsWith('...'));
        });

        test('cleans up whitespace', () => {
            const result = formatErrorMessage('Error  with\n\tmultiple   spaces');
            assert.strictEqual(result, 'Error with multiple spaces');
        });

        test('uses default maxLength of 100', () => {
            const longMessage = 'B'.repeat(150);
            const result = formatErrorMessage(longMessage);
            assert.strictEqual(result.length, 100);
        });
    });

    suite('formatStackTraceForHover', () => {
        test('returns empty string for empty input', () => {
            assert.strictEqual(formatStackTraceForHover(''), '');
        });

        test('unescapes Teamcity newlines', () => {
            const result = formatStackTraceForHover('line1|nline2');
            assert.strictEqual(result, 'line1\nline2');
        });

        test('unescapes Teamcity carriage returns', () => {
            const result = formatStackTraceForHover('line1|rline2');
            assert.strictEqual(result, 'line1\rline2');
        });

        test('unescapes Teamcity apostrophes', () => {
            const result = formatStackTraceForHover("test|'s value");
            assert.strictEqual(result, "test's value");
        });

        test('unescapes Teamcity brackets', () => {
            const result = formatStackTraceForHover('array|[0|]');
            assert.strictEqual(result, 'array[0]');
        });

        test('unescapes Teamcity pipes', () => {
            const result = formatStackTraceForHover('cmd || other');
            assert.strictEqual(result, 'cmd | other');
        });

        test('handles all escapes together', () => {
            const result = formatStackTraceForHover("line|ntest|'s |[value|]||end");
            assert.strictEqual(result, "line\ntest's [value]|end");
        });
    });

    suite('getStatusIcon', () => {
        test('returns check for passed', () => {
            assert.strictEqual(getStatusIcon('passed'), '✅');
        });

        test('returns X for failed', () => {
            assert.strictEqual(getStatusIcon('failed'), '❌');
        });

        test('returns yellow for skipped', () => {
            assert.strictEqual(getStatusIcon('skipped'), '🟡');
        });

        test('returns hourglass for running', () => {
            assert.strictEqual(getStatusIcon('running'), '⏳');
        });

        test('returns circle for none/unknown', () => {
            assert.strictEqual(getStatusIcon('none'), '○');
        });
    });

    suite('getStatusThemeColor', () => {
        test('returns correct color for passed', () => {
            assert.strictEqual(getStatusThemeColor('passed'), 'testing.iconPassed');
        });

        test('returns correct color for failed', () => {
            assert.strictEqual(getStatusThemeColor('failed'), 'testing.iconFailed');
        });

        test('returns correct color for skipped', () => {
            assert.strictEqual(getStatusThemeColor('skipped'), 'testing.iconSkipped');
        });

        test('returns correct color for running', () => {
            assert.strictEqual(getStatusThemeColor('running'), 'testing.runAction');
        });

        test('returns foreground for none', () => {
            assert.strictEqual(getStatusThemeColor('none'), 'foreground');
        });
    });
});
