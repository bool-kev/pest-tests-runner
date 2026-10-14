import * as assert from 'assert';
import { parseTeamcityLine, stripDatasetSuffix, TeamcityEvent } from '../teamcityParser';
import { formatDuration } from '../utils/testResultTypes';

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

    // Lines captured from Pest 3.8 (--teamcity) on Windows
    suite('real Pest output', () => {
        test('top-level it() keeps the "it " prefix in the description', () => {
            const result = parseTeamcityLine("##teamcity[testStarted name='it top level it' locationHint='pest_qn://tests\\Unit\\FormatTest.php::it top level it' flowId='20460']");
            assert.strictEqual(result?.event, TeamcityEvent.testStarted);
            assert.strictEqual(result?.file, 'tests\\Unit\\FormatTest.php');
            assert.strictEqual(result?.description, 'it top level it');
        });

        test('nested describes', () => {
            const result = parseTeamcityLine("##teamcity[testStarted name='`Outer` → `Inner` → it works' locationHint='pest_qn://tests\\Unit\\FormatTest.php::`Outer` → `Inner` → it works' flowId='20460']");
            assert.strictEqual(result?.description, '`Outer` → `Inner` → it works');
        });

        test('description containing "::" is split on the first separator', () => {
            const result = parseTeamcityLine("##teamcity[testStarted name='Foo::bar() with :: inside' locationHint='pest_qn://tests\\Unit\\FormatTest.php::Foo::bar() with :: inside' flowId='20460']");
            assert.strictEqual(result?.file, 'tests\\Unit\\FormatTest.php');
            assert.strictEqual(result?.description, 'Foo::bar() with :: inside');
        });

        test('apostrophes and accents', () => {
            const result = parseTeamcityLine("##teamcity[testStarted name='nom avec l|'apostrophe et é' locationHint='pest_qn://tests\\Unit\\FormatTest.php::nom avec l|'apostrophe et é' flowId='20460']");
            assert.strictEqual(result?.name, "nom avec l'apostrophe et é");
            assert.strictEqual(result?.description, "nom avec l'apostrophe et é");
        });

        test('file-level suite has no description', () => {
            const result = parseTeamcityLine("##teamcity[testSuiteStarted name='Tests\\Unit\\FormatTest' locationHint='pest_qn://tests\\Unit\\FormatTest.php' flowId='20460']");
            assert.strictEqual(result?.file, 'tests\\Unit\\FormatTest.php');
            assert.strictEqual(result?.description, undefined);
        });

        test('comparison failure carries expected and actual', () => {
            const result = parseTeamcityLine("##teamcity[testFailed name='fails compare' message='Failed asserting that two arrays are identical.' details='at tests\\Unit\\FormatTest.php:7' type='comparisonFailure' actual='Array &0 |[|n    |'a|' => 1,|n|]' expected='Array &0 |[|n    |'a|' => 2,|n|]' flowId='20460']");
            assert.strictEqual(result?.type, 'comparisonFailure');
            assert.strictEqual(result?.expected, "Array &0 [\n    'a' => 2,\n]");
            assert.strictEqual(result?.actual, "Array &0 [\n    'a' => 1,\n]");
            assert.strictEqual(result?.details, 'at tests\\Unit\\FormatTest.php:7');
        });

        test('dataset case', () => {
            const result = parseTeamcityLine("##teamcity[testStarted name='it has dataset with data set \"(|'two|')\"' locationHint='pest_qn://tests\\Unit\\FormatTest.php::it has dataset with data set \"(|'two|')\"' flowId='20460']");
            assert.strictEqual(result?.description, 'it has dataset with data set "(\'two\')"');
            assert.strictEqual(stripDatasetSuffix(result!.description!), 'it has dataset');
        });

        test('testStdOut output', () => {
            const result = parseTeamcityLine("##teamcity[testStdOut name='prints' out='hello|n' flowId='1']");
            assert.strictEqual(result?.event, TeamcityEvent.testStdOut);
            assert.strictEqual(result?.out, 'hello\n');
        });
    });

    suite('unescaping', () => {
        test('escaped pipe followed by n is not a newline', () => {
            const result = parseTeamcityLine("##teamcity[testFailed name='test' message='a ||n b']");
            assert.strictEqual(result?.message, 'a |n b');
        });

        test('unknown escape is kept', () => {
            const result = parseTeamcityLine("##teamcity[testFailed name='test' message='a |x b']");
            assert.strictEqual(result?.message, 'a |x b');
        });
    });

    suite('stripDatasetSuffix', () => {
        test('keeps descriptions without dataset', () => {
            assert.strictEqual(stripDatasetSuffix('it works'), 'it works');
        });

        test('strips named dataset', () => {
            assert.strictEqual(stripDatasetSuffix('it named dataset with data set "dataset "one""'), 'it named dataset');
        });
    });

    suite('formatDuration', () => {
        test('formats very small durations (milliseconds)', () => {
            const result = formatDuration(0.0005); // 0.5ms
            assert.strictEqual(result, '0.50ms');
        });

        test('formats sub-second durations', () => {
            const result = formatDuration(0.250); // 250ms
            assert.strictEqual(result, '0.250s');
        });

        test('formats seconds', () => {
            const result = formatDuration(1.5); // 1.5s
            assert.strictEqual(result, '1.50s');
        });

        test('formats large durations', () => {
            const result = formatDuration(5); // 5s
            assert.strictEqual(result, '5.00s');
        });

        test('formats minutes', () => {
            const result = formatDuration(90); // 90s = 1m 30s
            assert.strictEqual(result, '1m 30.0s');
        });
    });
});
