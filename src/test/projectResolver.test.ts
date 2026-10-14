import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expandProjectRootSetting, findPestScript, ProjectResolver } from '../project/projectResolver';

function touch(file: string, content = ''): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

suite('Project Resolver Test Suite', () => {
    let workspace: string;

    setup(() => {
        // workspace/                 <- folder opened in VS Code (parent folder)
        //   backend/                 <- Pest project
        //     vendor/pestphp/pest/bin/pest
        //     tests/Feature/UserTest.php
        //   api/                     <- second project, vendor/bin/pest only
        //     vendor/bin/pest
        //     tests/Unit/ApiTest.php
        //   fresh/                   <- composer project without vendor (not installed yet)
        //     composer.json, phpunit.xml, tests/FreshTest.php
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pest-resolver-'));
        touch(path.join(workspace, 'backend', 'vendor', 'pestphp', 'pest', 'bin', 'pest'));
        touch(path.join(workspace, 'backend', 'tests', 'Feature', 'UserTest.php'));
        touch(path.join(workspace, 'api', 'vendor', 'bin', 'pest'));
        touch(path.join(workspace, 'api', 'tests', 'Unit', 'ApiTest.php'));
        touch(path.join(workspace, 'fresh', 'composer.json'), '{}');
        touch(path.join(workspace, 'fresh', 'phpunit.xml'), '<phpunit/>');
        touch(path.join(workspace, 'fresh', 'tests', 'FreshTest.php'));
    });

    teardown(() => {
        fs.rmSync(workspace, { recursive: true, force: true });
    });

    test('finds the project inside a parent folder', () => {
        const resolver = new ProjectResolver();
        const file = path.join(workspace, 'backend', 'tests', 'Feature', 'UserTest.php');
        assert.strictEqual(resolver.resolve(file, workspace), path.join(workspace, 'backend'));
    });

    test('resolves each project of a monorepo independently', () => {
        const resolver = new ProjectResolver();
        assert.strictEqual(
            resolver.resolve(path.join(workspace, 'api', 'tests', 'Unit', 'ApiTest.php'), workspace),
            path.join(workspace, 'api')
        );
        assert.strictEqual(
            resolver.resolve(path.join(workspace, 'backend', 'tests', 'Feature', 'UserTest.php'), workspace),
            path.join(workspace, 'backend')
        );
    });

    test('falls back to composer.json + phpunit.xml when vendor is missing', () => {
        const resolver = new ProjectResolver();
        assert.strictEqual(
            resolver.resolve(path.join(workspace, 'fresh', 'tests', 'FreshTest.php'), workspace),
            path.join(workspace, 'fresh')
        );
    });

    test('projectRoot setting wins, relative to the workspace folder', () => {
        const resolver = new ProjectResolver();
        const file = path.join(workspace, 'backend', 'tests', 'Feature', 'UserTest.php');
        assert.strictEqual(resolver.resolve(file, workspace, 'api'), path.join(workspace, 'api'));
        assert.strictEqual(resolver.resolve(file, workspace, '${workspaceFolder}/api'), path.join(workspace, 'api'));
    });

    test('findPestScript prefers the real script over the composer proxy', () => {
        assert.strictEqual(findPestScript(path.join(workspace, 'backend')), 'vendor/pestphp/pest/bin/pest');
        assert.strictEqual(findPestScript(path.join(workspace, 'api')), 'vendor/bin/pest');
        assert.strictEqual(findPestScript(path.join(workspace, 'fresh')), undefined);
    });

    test('empty setting means auto-detection', () => {
        assert.strictEqual(expandProjectRootSetting('  ', workspace), undefined);
    });
});
