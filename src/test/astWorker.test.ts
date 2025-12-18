import * as assert from 'assert';
import { parsePhpAsync } from '../utils/astWorker';

suite('AST Worker Test Suite', () => {

    suite('parsePhpAsync', () => {
        test('parses simple PHP test file', async () => {
            const code = `<?php
                test('async test', function () {});
            `;
            const tests = await parsePhpAsync(code);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'async test');
        });

        test('parses multiple tests', async () => {
            const code = `<?php
                test('first', function () {});
                it('second', function () {});
                describe('group', function () {
                    test('nested', function () {});
                });
            `;
            const tests = await parsePhpAsync(code);
            assert.strictEqual(tests.length, 4);
        });

        test('uses cache for same content', async () => {
            const code = `<?php test('cached', function () {});`;
            // Use unique cache key to avoid collision with other tests
            const cacheKey = 'cache-test-' + Date.now() + '.php';

            // First call - should parse and cache
            const result1 = await parsePhpAsync(code, cacheKey);
            assert.strictEqual(result1.length, 1);
            assert.strictEqual(result1[0].name, 'cached');

            // Second call - should use cache (same result)
            const result2 = await parsePhpAsync(code, cacheKey);
            assert.strictEqual(result2.length, 1);
            assert.strictEqual(result2[0].name, 'cached');
        });

        test('invalidates cache when content changes', async () => {
            const cacheKey = 'changing-file-' + Date.now() + '.php';

            const code1 = `<?php test('version1', function () {});`;
            await parsePhpAsync(code1, cacheKey);

            const code2 = `<?php test('version2', function () {});`;
            const result = await parsePhpAsync(code2, cacheKey);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'version2');
        });

        test('works without cache key', async () => {
            const code = `<?php test('no-cache', function () {});`;
            const result = await parsePhpAsync(code);
            assert.strictEqual(result.length, 1);
        });

        test('handles empty PHP file', async () => {
            const code = `<?php`;
            const result = await parsePhpAsync(code);
            assert.strictEqual(result.length, 0);
        });

        test('handles invalid PHP gracefully', async () => {
            const code = 'not valid php at all {{{';
            const result = await parsePhpAsync(code);
            assert.ok(Array.isArray(result));
        });
    });
});
