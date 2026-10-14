import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    buildFilter,
    buildPestCommand,
    escapeRegex,
    MAX_FILTER_LENGTH,
    RunnerSettings,
    splitCommandLine,
    toProjectRelative,
} from '../runner/commandBuilder';

const defaults: RunnerSettings = {
    command: '',
    additionalArgs: [],
    env: {},
    disableXdebug: true,
};

suite('Command Builder Test Suite', () => {
    let root: string;

    setup(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'pest-command-'));
        fs.mkdirSync(path.join(root, 'vendor', 'pestphp', 'pest', 'bin'), { recursive: true });
        fs.writeFileSync(path.join(root, 'vendor', 'pestphp', 'pest', 'bin', 'pest'), '');
        fs.mkdirSync(path.join(root, 'vendor', 'bin'), { recursive: true });
        fs.writeFileSync(path.join(root, 'vendor', 'bin', 'pest'), '');
    });

    teardown(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    suite('buildPestCommand', () => {
        test('runs PHP directly from the project root, without shell or .bat', () => {
            const file = path.join(root, 'tests', 'Unit', 'FooTest.php');
            const command = buildPestCommand(defaults, root, undefined, { files: [file] });
            assert.strictEqual(command.command, 'php');
            assert.deepStrictEqual(command.args, ['vendor/pestphp/pest/bin/pest', 'tests/Unit/FooTest.php', '--teamcity']);
            assert.strictEqual(command.cwd, root);
            assert.strictEqual(command.env.XDEBUG_MODE, 'off');
        });

        test('whole suite has no file argument', () => {
            const command = buildPestCommand(defaults, root, undefined, { files: [] });
            assert.deepStrictEqual(command.args, ['vendor/pestphp/pest/bin/pest', '--teamcity']);
        });

        test('adds a delimited filter and additional args', () => {
            const settings = { ...defaults, additionalArgs: ['--stop-on-failure'] };
            const command = buildPestCommand(settings, root, undefined, { files: [path.join(root, 'tests', 'A.php')], tests: ['it works'] });
            assert.deepStrictEqual(command.args.slice(-3), ['--filter', '/::(?:it works)(?: with data set .*)?$/', '--stop-on-failure']);
        });

        test('drops a filter longer than the command line limit', () => {
            const tests = Array.from({ length: 400 }, (_, i) => `a fairly long test description number ${i}`);
            const command = buildPestCommand(defaults, root, undefined, { files: [path.join(root, 'tests', 'A.php')], tests });
            assert.ok(buildFilter(tests, [])!.length > MAX_FILTER_LENGTH);
            assert.ok(!command.args.includes('--filter'));
        });

        test('custom Docker command keeps relative paths and no Xdebug override', () => {
            const settings = { ...defaults, command: 'docker compose exec -T "laravel.test" php vendor/bin/pest' };
            const command = buildPestCommand(settings, root, undefined, { files: [path.join(root, 'tests', 'Feature', 'UserTest.php')] });
            assert.strictEqual(command.command, 'docker');
            assert.deepStrictEqual(command.args, ['compose', 'exec', '-T', 'laravel.test', 'php', 'vendor/bin/pest', 'tests/Feature/UserTest.php', '--teamcity']);
            assert.strictEqual(command.isCustom, true);
            assert.strictEqual(command.env.XDEBUG_MODE, undefined);
        });

        test('WSL command', () => {
            const settings = { ...defaults, command: 'wsl php vendor/bin/pest' };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.strictEqual(command.command, 'wsl');
            assert.deepStrictEqual(command.args, ['php', 'vendor/bin/pest', '--teamcity']);
        });

        test('relative executable resolved from the project root (Sail)', () => {
            const settings = { ...defaults, command: './vendor/bin/sail pest' };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.strictEqual(command.command, path.resolve(root, 'vendor/bin/sail'));
        });

        test('${projectRoot} variable', () => {
            const settings = { ...defaults, command: 'php ${projectRoot}/vendor/bin/pest' };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.strictEqual(command.args[0], `${root}/vendor/bin/pest`);
            assert.strictEqual(command.isCustom, false);
            assert.strictEqual(command.env.XDEBUG_MODE, 'off');
        });

        test('a PHP executable alone gets the project Pest script appended', () => {
            const settings = { ...defaults, command: 'C:\\laragon\\bin\\php\\php-8.3.16-Win32-vs16-x64\\php.exe' };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.strictEqual(command.command, 'C:\\laragon\\bin\\php\\php-8.3.16-Win32-vs16-x64\\php.exe');
            assert.deepStrictEqual(command.args, ['vendor/pestphp/pest/bin/pest', '--teamcity']);
            assert.strictEqual(command.env.XDEBUG_MODE, 'off');
        });

        test('PHP options without a script also get the Pest script', () => {
            const settings = { ...defaults, command: 'php8.3 -d memory_limit=1G' };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.deepStrictEqual(command.args, ['-d', 'memory_limit=1G', 'vendor/pestphp/pest/bin/pest', '--teamcity']);
        });

        test('WSL / Docker commands are left untouched', () => {
            const settings = { ...defaults, command: 'wsl php' };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.deepStrictEqual(command.args, ['php', '--teamcity']);
        });

        test('a specific local php.exe is still treated as local PHP (Xdebug off)', () => {
            const settings = { ...defaults, command: '"C:\\laragon\\bin\\php\\php-8.3\\php.exe" vendor/bin/pest' };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.strictEqual(command.command, 'C:\\laragon\\bin\\php\\php-8.3\\php.exe');
            assert.deepStrictEqual(command.args, ['vendor/bin/pest', '--teamcity']);
            assert.strictEqual(command.isCustom, false);
            assert.strictEqual(command.env.XDEBUG_MODE, 'off');
        });

        test('user XDEBUG_MODE is respected', () => {
            const settings = { ...defaults, env: { XDEBUG_MODE: 'coverage' } };
            const command = buildPestCommand(settings, root, undefined, { files: [] });
            assert.strictEqual(command.env.XDEBUG_MODE, 'coverage');
        });
    });

    suite('buildFilter', () => {
        test('escapes regex characters, @ and # (dataset selectors in Pest)', () => {
            assert.strictEqual(
                buildFilter(['parens (x) and @user #1 a.b'], []),
                '/::(?:parens \\(x\\) and \\@user \\#1 a\\.b)(?: with data set .*)?$/'
            );
        });

        test('keeps describe arrows and backticks, escapes slashes', () => {
            assert.strictEqual(
                buildFilter(['`Outer` → it handles a/b'], []),
                '/::(?:`Outer` → it handles a\\/b)(?: with data set .*)?$/'
            );
        });

        test('describe selects every nested test', () => {
            assert.strictEqual(buildFilter([], ['`Outer`']), '/::(?:`Outer`) → /');
        });

        test('tests and describes combined', () => {
            assert.strictEqual(
                buildFilter(['top level test'], ['`Outer` → `Inner`']),
                '/::(?:(?:top level test)(?: with data set .*)?$|(?:`Outer` → `Inner`) → )/'
            );
        });

        test('nothing selected', () => {
            assert.strictEqual(buildFilter([], []), undefined);
        });

        test('escapeRegex', () => {
            assert.strictEqual(escapeRegex("Foo::bar() l'é"), "Foo\\:\\:bar\\(\\) l'é");
        });
    });

    suite('splitCommandLine', () => {
        test('splits on whitespace and honours quotes', () => {
            assert.deepStrictEqual(
                splitCommandLine(`"C:\\Program Files\\php\\php.exe" vendor/bin/pest --group 'slow tests'`),
                ['C:\\Program Files\\php\\php.exe', 'vendor/bin/pest', '--group', 'slow tests']
            );
        });

        test('keeps empty quoted arguments', () => {
            assert.deepStrictEqual(splitCommandLine(`a "" b`), ['a', '', 'b']);
        });
    });

    suite('toProjectRelative', () => {
        test('uses forward slashes', () => {
            assert.strictEqual(toProjectRelative(root, path.join(root, 'tests', 'Unit', 'A.php')), 'tests/Unit/A.php');
        });

        test('keeps files outside the project absolute', () => {
            const outside = path.join(os.tmpdir(), 'elsewhere', 'A.php');
            assert.strictEqual(toProjectRelative(root, outside), outside);
        });
    });
});
