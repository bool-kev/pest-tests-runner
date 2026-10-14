import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectResolver } from '../project/projectResolver';
import { ResultStore } from '../testing/resultStore';
import { PestTestController } from '../testing/testController';
import { projectItemId, testItemId } from '../testing/testTree';

suite('Test Controller Test Suite', () => {
    let root: string;
    let file: string;
    let store: ResultStore;
    let log: string[];
    let controller: PestTestController;

    setup(async () => {
        // composer project whose dependencies were never installed
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'pest-controller-'));
        file = path.join(root, 'tests', 'Feature', 'UserTest.php');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(path.join(root, 'composer.json'), '{}');
        fs.writeFileSync(path.join(root, 'phpunit.xml'), '<phpunit/>');
        fs.writeFileSync(file, `<?php
describe('Users', function () {
    it('can register', fn () => expect(true)->toBeTrue());
});
test('standalone', fn () => expect(true)->toBeTrue());
`);

        log = [];
        store = new ResultStore();
        const output = { appendLine: (line: string) => log.push(line), show: () => undefined } as unknown as vscode.OutputChannel;
        controller = new PestTestController(new ProjectResolver(), store, output, `pest-controller-${Date.now()}`);
        controller.updateFromDocument(await vscode.workspace.openTextDocument(file));
    });

    teardown(() => {
        controller.dispose();
        store.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('builds project > file > describe > test items', () => {
        const project = controller.controller.items.get(projectItemId(root));
        assert.ok(project, 'project item');
        const fileItem = controller.tree.getFileItem(file)!;
        assert.strictEqual(fileItem.label, 'tests/Feature/UserTest.php');

        const describe = controller.tree.findById(testItemId(file, '`Users`'))!;
        assert.strictEqual(describe.parent?.id, fileItem.id);
        const nested = controller.tree.findById(testItemId(file, '`Users` → it can register'))!;
        assert.strictEqual(nested.parent?.id, describe.id);
        assert.strictEqual(nested.range?.start.line, 2);
    });

    test('missing Pest fails fast with a clear message and no test stays running', async () => {
        await controller.runItems([controller.tree.getFileItem(file)!], false);

        for (const pestId of ['`Users` → it can register', 'standalone']) {
            const result = store.get(testItemId(file, pestId));
            assert.strictEqual(result?.status, 'errored', pestId);
            assert.ok(result?.message?.includes('composer install'), result?.message);
        }
        assert.ok(log.some(line => line.includes('Pest was not found')), log.join('\n'));
    });

    test('edits are re-synced, keeping the same item objects', async () => {
        const before = controller.tree.findById(testItemId(file, 'standalone'))!;
        const document = await vscode.workspace.openTextDocument(file);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, new vscode.Position(0, 5), '\n');
        await vscode.workspace.applyEdit(edit);
        controller.updateFromDocument(document);

        const after = controller.tree.findById(testItemId(file, 'standalone'))!;
        assert.strictEqual(after, before);
        assert.strictEqual(after.range?.start.line, 5);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    });
});
