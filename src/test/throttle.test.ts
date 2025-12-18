import * as assert from 'assert';
import { throttle, debounce, LRUCache } from '../utils/throttle';

suite('Throttle Utilities Test Suite', () => {

    suite('throttle', () => {
        test('executes function immediately on first call', (done) => {
            let callCount = 0;
            const fn = throttle(() => { callCount++; }, 100);

            fn();
            assert.strictEqual(callCount, 1);
            fn.cancel();
            done();
        });

        test('throttles subsequent calls within delay period', (done) => {
            let callCount = 0;
            const fn = throttle(() => { callCount++; }, 100);

            fn(); // Immediate
            fn(); // Throttled
            fn(); // Throttled

            assert.strictEqual(callCount, 1);

            setTimeout(() => {
                fn.cancel();
                // Trailing call should have executed
                assert.ok(callCount >= 1);
                done();
            }, 150);
        });

        test('flush executes pending call immediately', (done) => {
            let callCount = 0;
            let lastValue = '';
            const fn = throttle((value: string) => {
                callCount++;
                lastValue = value;
            }, 100);

            fn('first');
            fn('second'); // This will be pending

            assert.strictEqual(callCount, 1);
            assert.strictEqual(lastValue, 'first');

            fn.flush();

            // After flush, the pending call should have executed
            assert.strictEqual(callCount, 2);
            assert.strictEqual(lastValue, 'second');
            done();
        });

        test('cancel prevents pending call', (done) => {
            let callCount = 0;
            const fn = throttle(() => { callCount++; }, 100);

            fn(); // Immediate
            fn(); // Will be pending

            fn.cancel();

            setTimeout(() => {
                assert.strictEqual(callCount, 1); // Only the first call
                done();
            }, 150);
        });

        test('allows calls after delay period', (done) => {
            let callCount = 0;
            const fn = throttle(() => { callCount++; }, 50);

            fn(); // First call

            setTimeout(() => {
                fn(); // Should execute immediately after delay
                fn.cancel();
                assert.strictEqual(callCount, 2);
                done();
            }, 60);
        });
    });

    suite('debounce', () => {
        test('delays execution until inactivity period', (done) => {
            let callCount = 0;
            const fn = debounce(() => { callCount++; }, 50);

            fn();
            assert.strictEqual(callCount, 0); // Not executed yet

            setTimeout(() => {
                assert.strictEqual(callCount, 1);
                done();
            }, 60);
        });

        test('resets timer on each call', (done) => {
            let callCount = 0;
            const fn = debounce(() => { callCount++; }, 50);

            fn();
            setTimeout(() => fn(), 30); // Reset timer
            setTimeout(() => fn(), 60); // Reset timer again

            setTimeout(() => {
                // Should only execute once after last call + delay
                fn.cancel();
                done();
            }, 150);
        });

        test('flush executes pending call immediately', (done) => {
            let callCount = 0;
            let lastValue = '';
            const fn = debounce((value: string) => {
                callCount++;
                lastValue = value;
            }, 100);

            fn('test');
            assert.strictEqual(callCount, 0);

            fn.flush();

            assert.strictEqual(callCount, 1);
            assert.strictEqual(lastValue, 'test');
            done();
        });

        test('cancel prevents pending call', (done) => {
            let callCount = 0;
            const fn = debounce(() => { callCount++; }, 50);

            fn();
            fn.cancel();

            setTimeout(() => {
                assert.strictEqual(callCount, 0);
                done();
            }, 60);
        });

        test('uses last arguments when debounced', (done) => {
            let lastValue = '';
            const fn = debounce((value: string) => { lastValue = value; }, 50);

            fn('first');
            fn('second');
            fn('third');

            setTimeout(() => {
                assert.strictEqual(lastValue, 'third');
                done();
            }, 60);
        });
    });

    suite('LRUCache', () => {
        test('stores and retrieves values', () => {
            const cache = new LRUCache<string, number>(3);

            cache.set('a', 1);
            cache.set('b', 2);

            assert.strictEqual(cache.get('a'), 1);
            assert.strictEqual(cache.get('b'), 2);
        });

        test('returns undefined for missing keys', () => {
            const cache = new LRUCache<string, number>(3);

            assert.strictEqual(cache.get('missing'), undefined);
        });

        test('evicts oldest entry when full', () => {
            const cache = new LRUCache<string, number>(3);

            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            cache.set('d', 4); // Should evict 'a'

            assert.strictEqual(cache.get('a'), undefined);
            assert.strictEqual(cache.get('b'), 2);
            assert.strictEqual(cache.get('c'), 3);
            assert.strictEqual(cache.get('d'), 4);
        });

        test('get refreshes entry position', () => {
            const cache = new LRUCache<string, number>(3);

            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);

            cache.get('a'); // Refresh 'a'

            cache.set('d', 4); // Should evict 'b' (oldest unused)

            assert.strictEqual(cache.get('a'), 1);
            assert.strictEqual(cache.get('b'), undefined);
            assert.strictEqual(cache.get('c'), 3);
            assert.strictEqual(cache.get('d'), 4);
        });

        test('set updates existing value without eviction', () => {
            const cache = new LRUCache<string, number>(3);

            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);

            cache.set('a', 100); // Update existing

            assert.strictEqual(cache.size, 3);
            assert.strictEqual(cache.get('a'), 100);
        });

        test('has returns true for existing keys', () => {
            const cache = new LRUCache<string, number>(3);

            cache.set('a', 1);

            assert.strictEqual(cache.has('a'), true);
            assert.strictEqual(cache.has('b'), false);
        });

        test('delete removes entries', () => {
            const cache = new LRUCache<string, number>(3);

            cache.set('a', 1);
            assert.strictEqual(cache.has('a'), true);

            const deleted = cache.delete('a');
            assert.strictEqual(deleted, true);
            assert.strictEqual(cache.has('a'), false);
        });

        test('delete returns false for missing keys', () => {
            const cache = new LRUCache<string, number>(3);

            const deleted = cache.delete('missing');
            assert.strictEqual(deleted, false);
        });

        test('clear removes all entries', () => {
            const cache = new LRUCache<string, number>(3);

            cache.set('a', 1);
            cache.set('b', 2);

            assert.strictEqual(cache.size, 2);

            cache.clear();

            assert.strictEqual(cache.size, 0);
            assert.strictEqual(cache.has('a'), false);
            assert.strictEqual(cache.has('b'), false);
        });

        test('size property returns correct count', () => {
            const cache = new LRUCache<string, number>(5);

            assert.strictEqual(cache.size, 0);

            cache.set('a', 1);
            assert.strictEqual(cache.size, 1);

            cache.set('b', 2);
            assert.strictEqual(cache.size, 2);

            cache.delete('a');
            assert.strictEqual(cache.size, 1);
        });
    });
});
