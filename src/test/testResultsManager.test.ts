import * as assert from 'assert';
import { TestResultsManager, TestResult, ExecutionSummary } from '../testResultsManager';

suite('TestResultsManager Test Suite', () => {
    let manager: TestResultsManager;

    setup(() => {
        manager = new TestResultsManager();
    });

    suite('setResult and getTestResult', () => {
        test('sets and retrieves test result', () => {
            manager.setResult('/path/test.php', {
                name: 'my test',
                status: 'passed',
                type: 'test'
            });

            const result = manager.getTestResult('/path/test.php', 'my test');
            assert.ok(result);
            assert.strictEqual(result?.name, 'my test');
            assert.strictEqual(result?.status, 'passed');
            assert.strictEqual(result?.type, 'test');
        });

        test('updates existing result', () => {
            manager.setResult('/path/test.php', {
                name: 'test',
                status: 'running',
                type: 'test'
            });

            manager.setResult('/path/test.php', {
                name: 'test',
                status: 'passed',
                duration: 0.5
            });

            const result = manager.getTestResult('/path/test.php', 'test');
            assert.strictEqual(result?.status, 'passed');
            assert.strictEqual(result?.duration, 0.5);
        });

        test('preserves previous values when partially updating', () => {
            manager.setResult('/path/test.php', {
                name: 'test',
                status: 'failed',
                type: 'test',
                errorMessage: 'Some error'
            });

            manager.setResult('/path/test.php', {
                name: 'test',
                duration: 1.0
            });

            const result = manager.getTestResult('/path/test.php', 'test');
            assert.strictEqual(result?.status, 'failed');
            assert.strictEqual(result?.message, 'Some error');
            assert.strictEqual(result?.duration, 1.0);
        });

        test('returns undefined for non-existent test', () => {
            const result = manager.getTestResult('/path/test.php', 'missing');
            assert.strictEqual(result, undefined);
        });

        test('returns undefined for non-existent file', () => {
            const result = manager.getTestResult('/missing/test.php', 'test');
            assert.strictEqual(result, undefined);
        });
    });

    suite('setTestResult (legacy API)', () => {
        test('works with legacy parameter order', () => {
            manager.setTestResult('/path/test.php', 'legacy test', 'passed', 10, 'test', 0.25);

            const result = manager.getTestResult('/path/test.php', 'legacy test');
            assert.ok(result);
            assert.strictEqual(result?.status, 'passed');
            assert.strictEqual(result?.duration, 0.25);
        });
    });

    suite('getAllResultsForFile', () => {
        test('returns all results for a file', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'failed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test3', status: 'skipped', type: 'test' });

            const results = manager.getAllResultsForFile('/path/test.php');
            assert.strictEqual(results.length, 3);
        });

        test('returns empty array for non-existent file', () => {
            const results = manager.getAllResultsForFile('/missing/test.php');
            assert.deepStrictEqual(results, []);
        });
    });

    suite('batch mode', () => {
        test('startBatch prevents events from firing', () => {
            let eventCount = 0;
            manager.onDidChangeResults(() => eventCount++);

            manager.startBatch();
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'passed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test3', status: 'passed', type: 'test' });

            assert.strictEqual(eventCount, 0);
        });

        test('endBatch fires single event after batch', () => {
            let eventCount = 0;
            manager.onDidChangeResults(() => eventCount++);

            manager.startBatch();
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'passed', type: 'test' });
            manager.endBatch();

            assert.strictEqual(eventCount, 1);
        });

        test('endBatch does not fire event if no changes', () => {
            let eventCount = 0;
            manager.onDidChangeResults(() => eventCount++);

            manager.startBatch();
            manager.endBatch();

            assert.strictEqual(eventCount, 0);
        });
    });

    suite('execution tracking', () => {
        test('startExecution and endExecution work correctly', () => {
            manager.startExecution('/path/test.php');

            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test', duration: 0.1 });
            manager.setResult('/path/test.php', { name: 'test2', status: 'passed', type: 'test', duration: 0.2 });

            const summary = manager.endExecution();

            assert.ok(summary);
            assert.strictEqual(summary?.total, 2);
            assert.strictEqual(summary?.passed, 2);
            assert.ok(summary?.totalDuration >= 0);
        });

        test('markTestStarted tracks start time', () => {
            manager.startExecution('/path/test.php');
            manager.markTestStarted('myTest');

            const startTime = manager.getTestStartTime('myTest');
            assert.ok(startTime);
            assert.ok(startTime! > 0);
        });

        test('endExecution returns null if not started', () => {
            const summary = manager.endExecution();
            assert.strictEqual(summary, null);
        });
    });

    suite('getExecutionSummary', () => {
        test('returns correct counts', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'failed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test3', status: 'skipped', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test4', status: 'running', type: 'test' });
            manager.setResult('/path/test.php', { name: 'describe', status: 'passed', type: 'describe' });

            const summary = manager.getExecutionSummary('/path/test.php');

            assert.strictEqual(summary.total, 4); // Only tests, not describe
            assert.strictEqual(summary.passed, 1);
            assert.strictEqual(summary.failed, 1);
            assert.strictEqual(summary.skipped, 1);
            assert.strictEqual(summary.running, 1);
        });

        test('calculates total duration', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test', duration: 0.5 });
            manager.setResult('/path/test.php', { name: 'test2', status: 'passed', type: 'test', duration: 1.5 });

            const summary = manager.getExecutionSummary('/path/test.php');
            assert.strictEqual(summary.totalDuration, 2.0);
        });
    });

    suite('formatSummary', () => {
        test('formats passed only summary', () => {
            const summary: ExecutionSummary = {
                total: 5,
                passed: 5,
                failed: 0,
                skipped: 0,
                running: 0,
                totalDuration: 1.234
            };

            const formatted = manager.formatSummary(summary);
            assert.ok(formatted.includes('✅'));
            assert.ok(formatted.includes('5 passed'));
            // Duration is formatted, check that it contains a time value
            assert.ok(formatted.includes('Total time:'));
        });

        test('formats mixed results summary', () => {
            const summary: ExecutionSummary = {
                total: 10,
                passed: 5,
                failed: 3,
                skipped: 2,
                running: 0,
                totalDuration: 5.5
            };

            const formatted = manager.formatSummary(summary);
            assert.ok(formatted.includes('✅'));
            assert.ok(formatted.includes('5 passed'));
            assert.ok(formatted.includes('❌'));
            assert.ok(formatted.includes('3 failed'));
            assert.ok(formatted.includes('🟡'));
            assert.ok(formatted.includes('2 skipped'));
        });

        test('shows "No tests executed" for empty summary', () => {
            const summary: ExecutionSummary = {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                running: 0,
                totalDuration: 0
            };

            const formatted = manager.formatSummary(summary);
            assert.ok(formatted.includes('No tests executed'));
        });
    });

    suite('getDescribeStatus', () => {
        test('returns stored describe result', () => {
            manager.setResult('/path/test.php', { name: 'MyGroup', status: 'passed', type: 'describe' });

            const result = manager.getDescribeStatus('/path/test.php', 'MyGroup');
            assert.ok(result);
            assert.strictEqual(result?.status, 'passed');
        });

        test('returns undefined for non-existent describe', () => {
            const result = manager.getDescribeStatus('/path/test.php', 'Missing');
            assert.strictEqual(result, undefined);
        });

        test('returns undefined for test with same name', () => {
            manager.setResult('/path/test.php', { name: 'TestName', status: 'passed', type: 'test' });

            const result = manager.getDescribeStatus('/path/test.php', 'TestName');
            assert.strictEqual(result, undefined);
        });
    });

    suite('calculateDescribeStatus', () => {
        test('returns passed when all child tests pass', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test', describeName: 'Group' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'passed', type: 'test', describeName: 'Group' });

            const result = manager.calculateDescribeStatus('/path/test.php', 'Group');
            assert.strictEqual(result.status, 'passed');
        });

        test('returns failed when any child test fails', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test', describeName: 'Group' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'failed', type: 'test', describeName: 'Group' });

            const result = manager.calculateDescribeStatus('/path/test.php', 'Group');
            assert.strictEqual(result.status, 'failed');
        });

        test('returns running when any child test is running', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test', describeName: 'Group' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'running', type: 'test', describeName: 'Group' });

            const result = manager.calculateDescribeStatus('/path/test.php', 'Group');
            assert.strictEqual(result.status, 'running');
        });

        test('returns skipped when tests are skipped and none failed', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'skipped', type: 'test', describeName: 'Group' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'skipped', type: 'test', describeName: 'Group' });

            const result = manager.calculateDescribeStatus('/path/test.php', 'Group');
            assert.strictEqual(result.status, 'skipped');
        });

        test('returns none for empty describe', () => {
            const result = manager.calculateDescribeStatus('/path/test.php', 'EmptyGroup');
            assert.strictEqual(result.status, 'none');
        });

        test('calculates total duration', () => {
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test', describeName: 'Group', duration: 0.5 });
            manager.setResult('/path/test.php', { name: 'test2', status: 'passed', type: 'test', describeName: 'Group', duration: 1.0 });

            const result = manager.calculateDescribeStatus('/path/test.php', 'Group');
            assert.strictEqual(result.duration, 1.5);
        });
    });

    suite('finalizeGroupStatuses', () => {
        test('finalizes describe status based on child tests', () => {
            manager.setResult('/path/test.php', { name: 'Group', status: 'running', type: 'describe' });
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test', describeName: 'Group' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'passed', type: 'test', describeName: 'Group' });

            manager.finalizeGroupStatuses('/path/test.php', new Set(['Group']), false);

            const result = manager.getTestResult('/path/test.php', 'Group');
            assert.strictEqual(result?.status, 'passed');
        });

        test('finalizes __FILE__ status', () => {
            manager.setResult('/path/test.php', { name: '__FILE__', status: 'running', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test1', status: 'passed', type: 'test' });
            manager.setResult('/path/test.php', { name: 'test2', status: 'failed', type: 'test' });

            manager.finalizeGroupStatuses('/path/test.php', new Set(), true);

            const result = manager.getTestResult('/path/test.php', '__FILE__');
            assert.strictEqual(result?.status, 'failed');
        });
    });

    suite('clearFileResults', () => {
        test('clears results for specific file', () => {
            manager.setResult('/path/test1.php', { name: 'test', status: 'passed', type: 'test' });
            manager.setResult('/path/test2.php', { name: 'test', status: 'passed', type: 'test' });

            manager.clearFileResults('/path/test1.php');

            assert.strictEqual(manager.getTestResult('/path/test1.php', 'test'), undefined);
            assert.ok(manager.getTestResult('/path/test2.php', 'test'));
        });

        test('does nothing for non-existent file', () => {
            let eventFired = false;
            manager.onDidChangeResults(() => eventFired = true);

            manager.clearFileResults('/nonexistent.php');

            assert.strictEqual(eventFired, false);
        });
    });

    suite('clearAllResults', () => {
        test('clears all results', () => {
            manager.setResult('/path/test1.php', { name: 'test', status: 'passed', type: 'test' });
            manager.setResult('/path/test2.php', { name: 'test', status: 'passed', type: 'test' });

            manager.clearAllResults();

            assert.strictEqual(manager.getAllResultsForFile('/path/test1.php').length, 0);
            assert.strictEqual(manager.getAllResultsForFile('/path/test2.php').length, 0);
        });

        test('does nothing if already empty', () => {
            let eventFired = false;
            manager.onDidChangeResults(() => eventFired = true);

            manager.clearAllResults();

            assert.strictEqual(eventFired, false);
        });
    });

    suite('onDidChangeResults', () => {
        test('fires event when result changes', () => {
            let eventFired = false;
            manager.onDidChangeResults(() => eventFired = true);

            manager.setResult('/path/test.php', { name: 'test', status: 'passed', type: 'test' });

            assert.strictEqual(eventFired, true);
        });

        test('does not fire when result is unchanged', () => {
            manager.setResult('/path/test.php', { name: 'test', status: 'passed', type: 'test' });

            let eventCount = 0;
            manager.onDidChangeResults(() => eventCount++);

            // Set same result
            manager.setResult('/path/test.php', { name: 'test', status: 'passed', type: 'test' });

            assert.strictEqual(eventCount, 0);
        });
    });
});
