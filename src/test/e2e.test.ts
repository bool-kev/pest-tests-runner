/**
 * End-to-end runs against a real Pest project (PHP required).
 * Skipped unless PEST_E2E_PROJECTS lists project roots (separated by ";") containing a copy of
 * fixtures/FormatTest.php in tests/Unit/, e.g. one Pest 3 and one Pest 4 project.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectResolver } from '../project/projectResolver';
import { ResultStore } from '../testing/resultStore';
import { PestTestController } from '../testing/testController';
import { normalizePath, testItemId } from '../testing/testTree';

const projects = (process.env.PEST_E2E_PROJECTS ?? '').split(';').filter(Boolean);

if (projects.length > 0) {
    suite('E2E: extension activation', () => {
        test('activates in the opened folder and registers its commands', async () => {
            const extension = vscode.extensions.getExtension('dark-shadow.pest-tests-runner');
            assert.ok(extension, 'extension found');
            await extension!.activate();
            assert.ok(extension!.isActive);

            const commands = await vscode.commands.getCommands(true);
            for (const command of ['runTest', 'debugTest', 'runTestFile', 'runTestSuite', 'runDescribeGroup']) {
                assert.ok(commands.includes(`pest-tests-runner.${command}`), command);
            }
        });
    });
}

for (const project of projects) {
    suite(`E2E: real Pest run (${path.basename(project)})`, function () {
        this.timeout(120000);

        const file = path.join(project, 'tests', 'Unit', 'FormatTest.php');
        const id = (pestId: string) => testItemId(file, pestId);
        let store: ResultStore;
        let output: vscode.OutputChannel;
        let controller: PestTestController;
        let log: string[];

        setup(async () => {
            log = [];
            store = new ResultStore();
            output = {
                appendLine: (line: string) => log.push(line),
            } as unknown as vscode.OutputChannel;
            controller = new PestTestController(new ProjectResolver(), store, output, `pest-e2e-${Date.now()}`);
            controller.updateFromDocument(await vscode.workspace.openTextDocument(file));
        });

        teardown(() => {
            controller.dispose();
            store.dispose();
        });

        test('runs a whole file from a parent folder', async () => {
            const fileItem = controller.tree.getFileItem(file)!;
            assert.ok(fileItem, 'file discovered');

            await controller.runItems([fileItem], false);

            // VS Code reports drive letters in lower case: compare normalized paths
            const cwdLine = log.find(line => line.includes('cwd: '));
            assert.strictEqual(normalizePath(cwdLine!.split('cwd: ')[1]), normalizePath(project), log.join('\n'));
            assert.ok(log.some(line => line.includes('XDEBUG_MODE=off')), 'Xdebug disabled');
            const expected: Record<string, string> = {
                'it top level it': 'passed',
                "nom avec l'apostrophe et é": 'passed',
                'parens (x) and @user #1 a.b': 'passed',
                'fails compare': 'failed',
                'skipped one': 'skipped',
                '`Outer` → `Inner` → it works': 'failed',
                '`Outer` → it after inner': 'passed',
                'it has dataset': 'failed',
                'it named dataset': 'passed',
                'Foo::bar() with :: inside': 'passed',
            };
            for (const [pestId, status] of Object.entries(expected)) {
                assert.strictEqual(store.get(id(pestId))?.status, status, `${pestId}\n${log.join('\n')}`);
            }
        });

        test('filter runs exactly one test with special characters', async () => {
            await controller.runItems([controller.tree.findById(id('parens (x) and @user #1 a.b'))!], false);

            assert.strictEqual(store.get(id('parens (x) and @user #1 a.b'))?.status, 'passed', log.join('\n'));
            assert.strictEqual(store.get(id('top level test')), undefined, 'other tests did not run');
        });

        test('describe runs nested tests only', async () => {
            await controller.runItems([controller.tree.findById(id('`Outer`'))!], false);

            assert.strictEqual(store.get(id('`Outer` → it works'))?.status, 'passed', log.join('\n'));
            assert.strictEqual(store.get(id('`Outer` → `Inner` → it works'))?.status, 'failed');
            assert.strictEqual(store.get(id('`Outer` → it after inner'))?.status, 'passed');
            assert.strictEqual(store.get(id('it top level it')), undefined);
        });

        test('same test name in another describe is not run', async () => {
            await controller.runItems([controller.tree.findById(id('`Outer` → it works'))!], false);

            assert.strictEqual(store.get(id('`Outer` → it works'))?.status, 'passed', log.join('\n'));
            assert.strictEqual(store.get(id('`Outer` → `Inner` → it works')), undefined);
        });

        test('a new run on the same project cancels the previous one and kills its process', async () => {
            const slowFile = path.join(project, 'tests', 'Unit', 'SlowTest.php');
            fs.writeFileSync(slowFile, "<?php\ntest('slow', function () { usleep(5000000); expect(true)->toBeTrue(); });\n");
            try {
                controller.updateFromDocument(await vscode.workspace.openTextDocument(slowFile));
                const started = Date.now();
                const slowRun = controller.runItems([controller.tree.getFileItem(slowFile)!], false);
                await new Promise(resolve => setTimeout(resolve, 1500));
                const fastRun = controller.runItems([controller.tree.findById(id('top level test'))!], false);
                await Promise.all([slowRun, fastRun]);

                assert.ok(Date.now() - started < 4500, `slow test was killed (took ${Date.now() - started}ms)`);
                assert.strictEqual(store.get(testItemId(slowFile, 'slow'))?.status, 'none', log.join('\n'));
                assert.strictEqual(store.get(id('top level test'))?.status, 'passed', log.join('\n'));
                assert.ok(log.some(line => line.includes('(cancelled)')), log.join('\n'));
            } finally {
                fs.rmSync(slowFile, { force: true });
            }
        });

        test('unicode test name', async () => {
            await controller.runItems([controller.tree.findById(id("nom avec l'apostrophe et é"))!], false);
            assert.strictEqual(store.get(id("nom avec l'apostrophe et é"))?.status, 'passed', log.join('\n'));
        });
    });
}
