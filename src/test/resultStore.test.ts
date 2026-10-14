import * as assert from 'assert';
import { ResultStore } from '../testing/resultStore';

suite('Result Store Test Suite', () => {
    let store: ResultStore;

    setup(() => {
        store = new ResultStore();
    });

    teardown(() => {
        store.dispose();
    });

    test('stores and returns results by test id', () => {
        store.set('file-a', 'file-a::it works', { status: 'passed', duration: 0.01 });
        assert.strictEqual(store.get('file-a::it works')?.status, 'passed');
        assert.strictEqual(store.get('file-a::unknown'), undefined);
    });

    suite('aggregate', () => {
        test('undefined when no test has run', () => {
            assert.strictEqual(store.aggregate(['a', 'b']), undefined);
        });

        test('failed wins over passed, durations add up', () => {
            store.set('f', 'a', { status: 'passed', duration: 0.5 });
            store.set('f', 'b', { status: 'failed', duration: 0.25 });
            assert.deepStrictEqual(store.aggregate(['a', 'b', 'never-ran']), { status: 'failed', duration: 0.75 });
        });

        test('running or queued wins over everything', () => {
            store.set('f', 'a', { status: 'failed' });
            store.set('f', 'b', { status: 'queued' });
            assert.strictEqual(store.aggregate(['a', 'b'])?.status, 'running');
        });

        test('skipped only when every test was skipped', () => {
            store.set('f', 'a', { status: 'skipped' });
            assert.strictEqual(store.aggregate(['a'])?.status, 'skipped');
            store.set('f', 'b', { status: 'passed' });
            assert.strictEqual(store.aggregate(['a', 'b'])?.status, 'passed');
        });

        test('errored counts as failed', () => {
            store.set('f', 'a', { status: 'errored' });
            assert.strictEqual(store.aggregate(['a'])?.status, 'failed');
        });
    });

    test('change notifications are coalesced and carry the changed files', done => {
        const notifications: string[][] = [];
        store.onDidChange(files => notifications.push([...files]));

        for (let i = 0; i < 200; i++) {
            store.set(`file-${i % 3}`, `test-${i}`, { status: 'running' });
        }

        setTimeout(() => {
            try {
                assert.ok(notifications.length <= 2, `expected at most 2 notifications, got ${notifications.length}`);
                assert.deepStrictEqual(new Set(notifications.flat()), new Set(['file-0', 'file-1', 'file-2']));
                done();
            } catch (error) {
                done(error);
            }
        }, 250);
    });

    test('unchanged results do not notify', done => {
        store.set('f', 'a', { status: 'passed', duration: 1 });
        setTimeout(() => {
            let count = 0;
            store.onDidChange(() => count++);
            store.set('f', 'a', { status: 'passed', duration: 1 });
            setTimeout(() => {
                assert.strictEqual(count, 0);
                done();
            }, 150);
        }, 150);
    });
});
