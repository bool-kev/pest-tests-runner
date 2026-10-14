import * as assert from 'assert';
import { parsePhpCached } from '../utils/astWorker';

suite('AST Worker Test Suite', () => {

    suite('parsePhpCached', () => {
        test('parses simple PHP test file', () => {
            const code = `<?php
                test('cached test', function () {});
            `;
            const cacheKey = 'simple-' + Date.now() + '.php';
            const tests = parsePhpCached(code, cacheKey);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'cached test');
        });

        test('parses multiple tests', () => {
            const code = `<?php
                test('first', function () {});
                it('second', function () {});
                describe('group', function () {
                    test('nested', function () {});
                });
            `;
            const cacheKey = 'multiple-' + Date.now() + '.php';
            const tests = parsePhpCached(code, cacheKey);
            assert.strictEqual(tests.length, 4);
        });

        test('uses cache for same content', () => {
            const code = `<?php test('cached', function () {});`;
            const cacheKey = 'cache-test-' + Date.now() + '.php';

            // First call - should parse and cache
            const result1 = parsePhpCached(code, cacheKey);
            assert.strictEqual(result1.length, 1);
            assert.strictEqual(result1[0].name, 'cached');

            // Second call - should use cache (same result object)
            const result2 = parsePhpCached(code, cacheKey);
            assert.strictEqual(result2.length, 1);
            assert.strictEqual(result2[0].name, 'cached');
            // Same array reference means cache was used
            assert.strictEqual(result1, result2);
        });

        test('invalidates cache when content changes', () => {
            const cacheKey = 'changing-file-' + Date.now() + '.php';

            const code1 = `<?php test('version1', function () {});`;
            parsePhpCached(code1, cacheKey);

            const code2 = `<?php test('version2', function () {});`;
            const result = parsePhpCached(code2, cacheKey);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'version2');
        });

        test('uses version for fast cache lookup', () => {
            const code = `<?php test('versioned', function () {});`;
            const cacheKey = 'versioned-' + Date.now() + '.php';

            // First call with version 1
            const result1 = parsePhpCached(code, cacheKey, 1);
            assert.strictEqual(result1.length, 1);

            // Second call with same version - should use cache
            const result2 = parsePhpCached(code, cacheKey, 1);
            assert.strictEqual(result1, result2);

            // Third call with different version but same content - should still use cache
            const result3 = parsePhpCached(code, cacheKey, 2);
            assert.strictEqual(result1, result3);
        });

        test('handles empty PHP file', () => {
            const code = `<?php`;
            const cacheKey = 'empty-' + Date.now() + '.php';
            const result = parsePhpCached(code, cacheKey);
            assert.strictEqual(result.length, 0);
        });

        test('handles invalid PHP gracefully', () => {
            const code = 'not valid php at all {{{';
            const cacheKey = 'invalid-' + Date.now() + '.php';
            const result = parsePhpCached(code, cacheKey);
            assert.ok(Array.isArray(result));
        });
    });
});
