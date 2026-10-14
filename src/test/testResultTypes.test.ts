import * as assert from 'assert';
import {
    extractErrorLineFromStackTrace,
    formatDuration,
    formatErrorMessage,
    getStatusIcon
} from '../utils/testResultTypes';

suite('Test Result Types Test Suite', () => {

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

        test('matches relative Pest frames against the absolute test path', () => {
            const stack = 'at tests\\Unit\\FormatTest.php:7';
            const line = extractErrorLineFromStackTrace(stack, 'D:\\labs\\app\\tests\\Unit\\FormatTest.php');
            assert.strictEqual(line, 7);
        });

        test('matches container paths (Docker / Sail)', () => {
            const stack = 'Exception: boom|n|n/var/www/html/app/Models/User.php:10|n/var/www/html/tests/Feature/UserTest.php:25';
            const line = extractErrorLineFromStackTrace(stack, 'D:\\projects\\shop\\tests\\Feature\\UserTest.php');
            assert.strictEqual(line, 25);
        });

        test('prefers the frame sharing the longest path suffix', () => {
            const stack = 'vendor/acme/lib/tests/UserTest.php:3\ntests/Feature/UserTest.php:12';
            const line = extractErrorLineFromStackTrace(stack, '/app/tests/Feature/UserTest.php');
            assert.strictEqual(line, 12);
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
});
