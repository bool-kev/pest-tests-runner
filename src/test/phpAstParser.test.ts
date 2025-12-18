import * as assert from 'assert';
import { parseTestsFromPhp, ParsedTest, decodeTestName } from '../phpAstParser';

suite('PHP AST Parser Test Suite', () => {

    suite('parseTestsFromPhp', () => {
        test('parses simple test', () => {
            const code = `
                <?php
                test('example test', function () {
                    expect(true)->toBeTrue();
                });
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'example test');
            assert.strictEqual(tests[0].type, 'test');
        });

        test('parses it test', () => {
            const code = `
                <?php
                it('example it', function () {
                    expect(true)->toBeTrue();
                });
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'example it');
            assert.strictEqual(tests[0].type, 'it');
        });

        test('parses describe block', () => {
            const code = `
                <?php
                describe('example group', function () {
                    test('inner test', function () {
                        expect(true)->toBeTrue();
                    });
                });
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 2);

            const describe = tests.find(t => t.type === 'describe');
            assert.ok(describe);
            assert.strictEqual(describe?.name, 'example group');

            const innerTest = tests.find(t => t.type === 'test');
            assert.ok(innerTest);
            assert.strictEqual(innerTest?.name, 'inner test');
        });

        test('parses multiple tests in a file', () => {
            const code = `
                <?php
                test('first test', function () {});
                test('second test', function () {});
                it('third test', function () {});
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 3);
            assert.strictEqual(tests[0].name, 'first test');
            assert.strictEqual(tests[1].name, 'second test');
            assert.strictEqual(tests[2].name, 'third test');
        });

        test('parses nested describe blocks', () => {
            const code = `
                <?php
                describe('outer', function () {
                    describe('inner', function () {
                        test('nested test', function () {});
                    });
                });
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 3);

            const describes = tests.filter(t => t.type === 'describe');
            assert.strictEqual(describes.length, 2);
            assert.ok(describes.find(d => d.name === 'outer'));
            assert.ok(describes.find(d => d.name === 'inner'));
        });

        test('captures correct line numbers', () => {
            const code = `<?php
test('line 2', function () {});
test('line 3', function () {});`;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 2);
            assert.strictEqual(tests[0].line, 1); // 0-based: line 2 = index 1
            assert.strictEqual(tests[1].line, 2); // 0-based: line 3 = index 2
        });

        test('handles arrow functions', () => {
            const code = `
                <?php
                test('arrow test', fn() => expect(true)->toBeTrue());
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'arrow test');
        });

        test('handles string concatenation', () => {
            const code = `
                <?php
                test('part1' . ' part2', function () {});
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'part1 part2');
        });

        test('returns empty array for invalid PHP', () => {
            const code = 'this is not valid php';
            const tests = parseTestsFromPhp(code);
            assert.ok(Array.isArray(tests));
        });

        test('returns empty array for PHP without tests', () => {
            const code = `
                <?php
                class MyClass {
                    public function myMethod() {}
                }
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 0);
        });

        test('handles test with special characters in name', () => {
            const code = `
                <?php
                test('test with "quotes" and \\backslash', function () {});
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 1);
            assert.ok(tests[0].name.includes('quotes'));
        });

        test('ignores non-test function calls', () => {
            const code = `
                <?php
                someFunction('not a test', function () {});
                test('actual test', function () {});
                anotherFunction('also not a test');
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'actual test');
        });

        test('handles mixed describe, test, and it', () => {
            const code = `
                <?php
                describe('Group', function () {
                    test('test one', function () {});
                    it('should do two', function () {});
                });
                test('standalone test', function () {});
            `;
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 4);

            assert.ok(tests.find(t => t.type === 'describe' && t.name === 'Group'));
            assert.ok(tests.find(t => t.type === 'test' && t.name === 'test one'));
            assert.ok(tests.find(t => t.type === 'it' && t.name === 'should do two'));
            assert.ok(tests.find(t => t.type === 'test' && t.name === 'standalone test'));
        });

        test('skips tests with variable names (cannot extract)', () => {
            const code = `
                <?php
                $testName = 'dynamic';
                test($testName, function () {});
                test('static name', function () {});
            `;
            const tests = parseTestsFromPhp(code);
            // Only static name should be captured
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].name, 'static name');
        });

        test('handles empty test file', () => {
            const code = '<?php';
            const tests = parseTestsFromPhp(code);
            assert.strictEqual(tests.length, 0);
        });
    });

    suite('decodeTestName', () => {
        test('decodes escaped apostrophes', () => {
            assert.strictEqual(decodeTestName("test\\'s name"), "test's name");
        });

        test('decodes escaped double quotes', () => {
            assert.strictEqual(decodeTestName('test\\"quoted\\"'), 'test"quoted"');
        });

        test('decodes escaped newlines', () => {
            assert.strictEqual(decodeTestName('line1\\nline2'), 'line1\nline2');
        });

        test('decodes escaped carriage returns', () => {
            assert.strictEqual(decodeTestName('line1\\rline2'), 'line1\rline2');
        });

        test('decodes escaped tabs', () => {
            assert.strictEqual(decodeTestName('col1\\tcol2'), 'col1\tcol2');
        });

        test('handles multiple escapes', () => {
            assert.strictEqual(
                decodeTestName("it\\'s a \\\"test\\\" with\\nnewline"),
                "it's a \"test\" with\nnewline"
            );
        });

        test('returns unchanged string without escapes', () => {
            assert.strictEqual(decodeTestName('simple name'), 'simple name');
        });
    });
});
