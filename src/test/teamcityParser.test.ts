import * as assert from 'assert';
import { parseTeamcityLine, TeamcityEvent } from '../teamcityParser';

suite('Teamcity Parser Test Suite', () => {

    suite('parseTeamcityLine', () => {
        test('parses testStarted event', () => {
            const line = "##teamcity[testStarted name='example test' flowId='123']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testStarted);
            assert.strictEqual(result?.name, 'example test');
            assert.strictEqual(result?.flowId, 123);
        });

        test('parses testFinished event with duration', () => {
            const line = "##teamcity[testFinished name='example test' duration='250' flowId='123']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testFinished);
            assert.strictEqual(result?.name, 'example test');
            assert.strictEqual(result?.duration, 250);
            assert.strictEqual(result?.flowId, 123);
        });

        test('parses testFailed event with message', () => {
            const line = "##teamcity[testFailed name='example test' message='Failed asserting that false is true.' flowId='123']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testFailed);
            assert.strictEqual(result?.name, 'example test');
            assert.strictEqual(result?.message, 'Failed asserting that false is true.');
        });

        test('parses testFailed event with details', () => {
            const line = "##teamcity[testFailed name='test' message='Error' details='Stack trace here']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testFailed);
            assert.strictEqual(result?.details, 'Stack trace here');
        });

        test('parses testIgnored event', () => {
            const line = "##teamcity[testIgnored name='skipped test' message='Skipped because...' flowId='123']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testIgnored);
            assert.strictEqual(result?.name, 'skipped test');
            assert.strictEqual(result?.message, 'Skipped because...');
        });

        test('parses testSuiteStarted event', () => {
            const line = "##teamcity[testSuiteStarted name='TestClass' flowId='123']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testSuiteStarted);
            assert.strictEqual(result?.name, 'TestClass');
        });

        test('parses testSuiteFinished event', () => {
            const line = "##teamcity[testSuiteFinished name='TestClass' flowId='123']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testSuiteFinished);
        });

        test('parses testCount event', () => {
            const line = "##teamcity[testCount count='42']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.event, TeamcityEvent.testCount);
            assert.strictEqual(result?.count, 42);
        });

        test('parses escaped apostrophe in name', () => {
            const line = "##teamcity[testStarted name='test with |'apostrophe|'' flowId='123']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.name, "test with 'apostrophe'");
        });

        test('parses escaped newlines', () => {
            const line = "##teamcity[testFailed name='test' message='line1|nline2']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.message, 'line1\nline2');
        });

        test('parses escaped brackets', () => {
            const line = "##teamcity[testFailed name='test' message='array|[0|]']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.message, 'array[0]');
        });

        test('parses escaped pipes', () => {
            const line = "##teamcity[testFailed name='test' message='a || b']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.message, 'a | b');
        });

        test('parses locationHint and extracts file', () => {
            const line = "##teamcity[testStarted name='test' locationHint='pest_qn:///path/to/test.php::testName']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.file, '/path/to/test.php');
            assert.strictEqual(result?.locationHint, 'pest_qn:///path/to/test.php::testName');
        });

        test('returns null for non-teamcity line', () => {
            const result = parseTeamcityLine('This is just a regular line');
            assert.strictEqual(result, null);
        });

        test('returns null for empty line', () => {
            const result = parseTeamcityLine('');
            assert.strictEqual(result, null);
        });

        test('returns null for malformed teamcity line', () => {
            const result = parseTeamcityLine('##teamcity[incomplete');
            assert.strictEqual(result, null);
        });

        test('handles whitespace in line', () => {
            const line = "  ##teamcity[testStarted name='test' flowId='1']  ";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.name, 'test');
        });

        test('handles multiple attributes', () => {
            const line = "##teamcity[testFailed name='test' message='error' details='stack' flowId='99' duration='100']";
            const result = parseTeamcityLine(line);
            assert.ok(result);
            assert.strictEqual(result?.name, 'test');
            assert.strictEqual(result?.message, 'error');
            assert.strictEqual(result?.details, 'stack');
            assert.strictEqual(result?.flowId, 99);
            assert.strictEqual(result?.duration, 100);
        });
    });
});
