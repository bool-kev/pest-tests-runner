import * as assert from 'assert';
import { parsePhpAsync, clearParseCache, getCacheStats } from '../utils/astWorker';

suite('AST Worker Test Suite', () => {

    // Clear cache before each test
    setup(() => {
        clearParseCache();
    });

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
            const cacheKey = 'test-file.php';

            // First call - should parse
            await parsePhpAsync(code, cacheKey);

            // Check cache
            const stats1 = getCacheStats();
            assert.strictEqual(stats1.size, 1);
            assert.ok(stats1.keys.includes(cacheKey));

            // Second call - should use cache
            const result = await parsePhpAsync(code, cacheKey);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'cached');
        });

        test('invalidates cache when content changes', async () => {
            const cacheKey = 'changing-file.php';

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

    suite('clearParseCache', () => {
        test('clears specific cache key', async () => {
            const code = `<?php test('t', function () {});`;

            await parsePhpAsync(code, 'file1.php');
            await parsePhpAsync(code, 'file2.php');

            assert.strictEqual(getCacheStats().size, 2);

            clearParseCache('file1.php');

            const stats = getCacheStats();
            assert.strictEqual(stats.size, 1);
            assert.ok(!stats.keys.includes('file1.php'));
            assert.ok(stats.keys.includes('file2.php'));
        });

        test('clears all cache when no key provided', async () => {
            const code = `<?php test('t', function () {});`;

            await parsePhpAsync(code, 'file1.php');
            await parsePhpAsync(code, 'file2.php');

            clearParseCache();

            assert.strictEqual(getCacheStats().size, 0);
        });
    });

    suite('getCacheStats', () => {
        test('returns correct size and keys', async () => {
            const code = `<?php test('t', function () {});`;

            await parsePhpAsync(code, 'a.php');
            await parsePhpAsync(code, 'b.php');
            await parsePhpAsync(code, 'c.php');

            const stats = getCacheStats();
            assert.strictEqual(stats.size, 3);
            assert.ok(stats.keys.includes('a.php'));
            assert.ok(stats.keys.includes('b.php'));
            assert.ok(stats.keys.includes('c.php'));
        });

        test('returns empty stats when cache is empty', () => {
            const stats = getCacheStats();
            assert.strictEqual(stats.size, 0);
            assert.deepStrictEqual(stats.keys, []);
        });
    });
});
