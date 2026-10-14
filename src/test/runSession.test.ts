import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseTestsFromPhp } from '../phpAstParser';
import { PestProcessResult } from '../runner/pestProcess';
import { parseTeamcityLine } from '../teamcityParser';
import { ResultStore } from '../testing/resultStore';
import { RunSession } from '../testing/runSession';
import { forEachLeaf, testItemId, TestTree } from '../testing/testTree';

// Real Pest 3.8 output (Windows) for fixtures/FormatTest.php
const FIXTURES = path.resolve(__dirname, '../../src/test/fixtures');

type Outcome = 'enqueued' | 'started' | 'passed' | 'failed' | 'skipped' | 'errored';

/** Records what the session reports, like VS Code would display it */
class RecordingRun implements vscode.TestRun {
    public readonly name = 'recording';
    public readonly isPersisted = false;
    public readonly token = new vscode.CancellationTokenSource().token;
    public readonly last = new Map<string, Outcome>();
    public readonly messages = new Map<string, vscode.TestMessage[]>();
    public output = '';

    enqueued(test: vscode.TestItem): void { this.last.set(test.id, 'enqueued'); }
    started(test: vscode.TestItem): void { this.last.set(test.id, 'started'); }
    skipped(test: vscode.TestItem): void { this.last.set(test.id, 'skipped'); }
    passed(test: vscode.TestItem): void { this.last.set(test.id, 'passed'); }
    failed(test: vscode.TestItem, message: vscode.TestMessage | readonly vscode.TestMessage[]): void {
        this.last.set(test.id, 'failed');
        this.messages.set(test.id, Array.isArray(message) ? [...message] : [message as vscode.TestMessage]);
    }
    errored(test: vscode.TestItem, message: vscode.TestMessage | readonly vscode.TestMessage[]): void {
        this.last.set(test.id, 'errored');
        this.messages.set(test.id, Array.isArray(message) ? [...message] : [message as vscode.TestMessage]);
    }
    appendOutput(output: string): void { this.output += output; }
    end(): void { /* nothing to do */ }
}

const processResult: PestProcessResult = {
    exitCode: 1, stderr: '', cancelled: false, eventCount: 43, totalMs: 500, usedShell: false,
};

suite('Run Session Test Suite', () => {
    let root: string;
    let file: string;
    let controller: vscode.TestController;
    let tree: TestTree;
    let store: ResultStore;
    let run: RecordingRun;
    let leaves: vscode.TestItem[];

    setup(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'pest-session-'));
        file = path.join(root, 'tests', 'Unit', 'FormatTest.php');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const content = fs.readFileSync(path.join(FIXTURES, 'FormatTest.php'), 'utf8');
        fs.writeFileSync(file, content);

        controller = vscode.tests.createTestController('pest-session-test', 'Pest session test');
        tree = new TestTree(controller);
        tree.syncFile(root, file, parseTestsFromPhp(content));
        store = new ResultStore();
        run = new RecordingRun();

        leaves = [];
        forEachLeaf(tree, tree.getFileItem(file)!, leaf => leaves.push(leaf));
    });

    teardown(() => {
        controller.dispose();
        store.dispose();
        fs.rmSync(root, { recursive: true, force: true });
    });

    function replay(session: RunSession): void {
        const lines = fs.readFileSync(path.join(FIXTURES, 'FormatTest.teamcity.txt'), 'utf8').split(/\r?\n/);
        for (const line of lines) {
            const event = parseTeamcityLine(line);
            if (event) {
                session.handleEvent(event);
            }
        }
    }

    const id = (pestId: string) => testItemId(file, pestId);

    test('every test of the file maps to its own item', () => {
        const session = new RunSession(run, tree, store, root, () => undefined);
        leaves.forEach(leaf => session.enqueue(leaf));
        replay(session);
        session.finalize(leaves, processResult, false);

        const expected: Record<string, Outcome> = {
            'it top level it': 'passed',
            'top level test': 'passed',
            "nom avec l'apostrophe et é": 'passed',
            'parens (x) and @user #1 a.b': 'passed',
            'fails compare': 'failed',
            'skipped one': 'skipped',
            'todo one': 'skipped',
            '`Outer` → it works': 'passed',
            '`Outer` → test inside': 'passed',
            '`Outer` → `Inner` → it works': 'failed',
            '`Outer` → it after inner': 'passed',
            'it has dataset': 'failed',
            'it named dataset': 'passed',
            'Foo::bar() with :: inside': 'passed',
        };
        for (const [pestId, outcome] of Object.entries(expected)) {
            assert.strictEqual(run.last.get(id(pestId)), outcome, pestId);
            assert.strictEqual(store.get(id(pestId))?.status, outcome, `store: ${pestId}`);
        }
        assert.ok(![...run.last.values()].includes('errored'), 'no test left without result');
    });

    test('datasets become children of their test', () => {
        const session = new RunSession(run, tree, store, root, () => undefined);
        replay(session);

        const named = tree.findById(id('it named dataset'))!;
        const labels: string[] = [];
        named.children.forEach(child => labels.push(child.label));
        assert.deepStrictEqual(labels.sort(), ['dataset "deux"', 'dataset "one"']);

        assert.strictEqual(run.last.get(id('it has dataset with data set "(1)"')), 'passed');
        assert.strictEqual(run.last.get(id('it has dataset with data set "(\'two\')"')), 'failed');
    });

    test('comparison failures give a diff and point at the failing line', () => {
        const session = new RunSession(run, tree, store, root, () => undefined);
        replay(session);

        const [message] = run.messages.get(id('fails compare'))!;
        assert.strictEqual(message.expectedOutput, "Array &0 [\n    'a' => 2,\n]");
        assert.strictEqual(message.actualOutput, "Array &0 [\n    'a' => 1,\n]");
        assert.strictEqual(message.location?.range.start.line, 6); // "at tests\Unit\FormatTest.php:7"
    });

    test('tests Pest never reported are errored instead of staying "running"', () => {
        const session = new RunSession(run, tree, store, root, () => undefined);
        leaves.forEach(leaf => session.enqueue(leaf));
        session.finalize(leaves, { ...processResult, eventCount: 0, exitCode: 255, stderr: 'PHP Fatal error: boom' }, false);

        for (const leaf of leaves) {
            assert.strictEqual(run.last.get(leaf.id), 'errored');
        }
        const message = run.messages.get(leaves[0].id)![0].message as string;
        assert.ok(message.includes('exited with code 255'));
        assert.ok(message.includes('PHP Fatal error: boom'));
    });

    test('cancelled runs mark pending tests as skipped', () => {
        const session = new RunSession(run, tree, store, root, () => undefined);
        leaves.forEach(leaf => session.enqueue(leaf));
        session.finalize(leaves, { ...processResult, cancelled: true }, true);

        for (const leaf of leaves) {
            assert.strictEqual(run.last.get(leaf.id), 'skipped');
            assert.strictEqual(store.get(leaf.id)?.status, 'none');
        }
    });

    test('tests of files not parsed yet are parsed on demand (whole suite runs)', () => {
        tree.removeFile(file);
        let parsedOnDemand = 0;
        const session = new RunSession(run, tree, store, root, reported => {
            parsedOnDemand++;
            tree.syncFile(root, reported, parseTestsFromPhp(fs.readFileSync(reported, 'utf8')));
        });
        replay(session);

        assert.strictEqual(parsedOnDemand, 1);
        assert.strictEqual(run.last.get(id('`Outer` → it after inner')), 'passed');
    });
});
