/**
 * Translate the Teamcity stream of one Pest run into TestRun states and stored results.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { stripDatasetSuffix, TeamcityEvent, TeamcityResult } from '../teamcityParser';
import { PestProcessResult } from '../runner/pestProcess';
import { extractErrorLineFromStackTrace, TestStatus } from '../utils/testResultTypes';
import { ResultStore } from './resultStore';
import { fileItemId, testItemId, TestTree } from './testTree';

const DATASET_SEPARATOR = ' with data set ';
const OUTPUT_TAIL_LINES = 30;

interface DatasetGroup {
    failures?: vscode.TestMessage[];
    allSkipped: boolean;
    duration: number;
}

export interface FailureSummary {
    label: string;
    message: string;
}

export class RunSession {
    /** Teamcity name -> item (finished/failed/ignored events only carry the name) */
    private readonly byName = new Map<string, vscode.TestItem>();
    private readonly suitesByName = new Map<string, vscode.TestItem>();
    private readonly groups = new Map<vscode.TestItem, DatasetGroup>();
    private readonly failures = new Map<vscode.TestItem, vscode.TestMessage[]>();
    private readonly ignored = new Set<vscode.TestItem>();
    private readonly parsedFiles = new Set<string>();
    private readonly finished = new Set<vscode.TestItem>();
    private outputTail: string[] = [];

    public readonly counts = { passed: 0, failed: 0, skipped: 0 };
    public readonly failedTests: FailureSummary[] = [];

    constructor(
        private readonly run: vscode.TestRun,
        private readonly tree: TestTree,
        private readonly store: ResultStore,
        private readonly projectRoot: string,
        /** Parse a file Pest reported but the tree doesn't know yet */
        private readonly ensureFileParsed: (file: string) => void
    ) { }

    public enqueue(item: vscode.TestItem): void {
        this.run.enqueued(item);
        this.storeResult(item, 'queued');
    }

    public handleOutput(text: string): void {
        this.run.appendOutput(text);
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        this.outputTail = [...this.outputTail, ...lines].slice(-OUTPUT_TAIL_LINES);
    }

    public handleEvent(event: TeamcityResult): void {
        switch (event.event) {
            case TeamcityEvent.testSuiteStarted: {
                // Suites with a description are tests with a dataset (file suites have none)
                const item = event.description ? this.resolveItem(event) : undefined;
                if (item && event.name) {
                    this.suitesByName.set(event.name, item);
                    this.groups.set(item, { allSkipped: true, duration: 0 });
                    this.markStarted(item);
                }
                break;
            }

            case TeamcityEvent.testSuiteFinished: {
                const item = event.name ? this.suitesByName.get(event.name) : undefined;
                if (item) {
                    this.suitesByName.delete(event.name!);
                    this.finishGroup(item);
                }
                break;
            }

            case TeamcityEvent.testStarted: {
                const item = this.resolveItem(event);
                if (item && event.name) {
                    this.byName.set(event.name, item);
                    this.failures.delete(item);
                    this.ignored.delete(item);
                    this.markStarted(item);
                }
                break;
            }

            case TeamcityEvent.testFailed: {
                const item = this.itemByName(event);
                if (item) {
                    const messages = this.failures.get(item) ?? [];
                    messages.push(this.buildFailureMessage(item, event));
                    this.failures.set(item, messages);
                }
                break;
            }

            case TeamcityEvent.testIgnored: {
                const item = this.itemByName(event);
                if (item) {
                    this.ignored.add(item);
                }
                break;
            }

            case TeamcityEvent.testFinished: {
                const item = this.itemByName(event);
                if (item) {
                    this.finishTest(item, event.duration ?? 0);
                }
                break;
            }

            case TeamcityEvent.testStdOut:
            case TeamcityEvent.testStdErr: {
                const item = this.itemByName(event);
                if (event.out) {
                    this.run.appendOutput(event.out.replace(/\r?\n/g, '\r\n'), undefined, item);
                }
                break;
            }
        }
    }

    /**
     * Settle every requested test Pest never reported, so nothing stays "running" forever
     */
    public finalize(leaves: Iterable<vscode.TestItem>, result: PestProcessResult | undefined, cancelled: boolean, reason?: string): void {
        const message = reason ?? this.explainMissingResult(result);
        for (const leaf of leaves) {
            if (this.finished.has(leaf)) {
                continue;
            }
            if (cancelled) {
                this.run.skipped(leaf);
                this.storeResult(leaf, 'none');
            } else {
                const testMessage = new vscode.TestMessage(message);
                if (leaf.uri && leaf.range) {
                    testMessage.location = new vscode.Location(leaf.uri, leaf.range.start);
                }
                this.run.errored(leaf, testMessage);
                this.storeResult(leaf, 'errored', undefined, message);
            }
        }
    }

    private explainMissingResult(result: PestProcessResult | undefined): string {
        if (!result) {
            return 'The test did not run.';
        }
        if (result.spawnError) {
            return `Could not start Pest: ${result.spawnError.message}`;
        }
        const tail = this.outputTail.join('\n') || result.stderr.trim();
        if (result.eventCount === 0) {
            return `Pest exited with code ${result.exitCode} before reporting any test.${tail ? `\n\n${tail}` : ''}`;
        }
        return 'Pest did not report a result for this test (it may have been filtered out, or its name is built at runtime).' +
            (result.exitCode !== 0 && tail ? `\n\n${tail}` : '');
    }

    private itemByName(event: TeamcityResult): vscode.TestItem | undefined {
        return event.name ? this.byName.get(event.name) : undefined;
    }

    private markStarted(item: vscode.TestItem): void {
        this.finished.delete(item);
        this.run.started(item);
        this.storeResult(item, 'running');
    }

    private finishTest(item: vscode.TestItem, durationMs: number): void {
        const failures = this.failures.get(item);
        const data = this.tree.getData(item);
        const skipped = !failures && (this.ignored.has(item) || !!data?.modifiers?.includes('todo'));

        if (failures) {
            this.run.failed(item, failures, durationMs);
            this.counts.failed++;
            this.failedTests.push({ label: data?.pestId ?? item.label, message: messageText(failures[0]) });
            this.storeResult(item, 'failed', durationMs, messageText(failures[0]));
        } else if (skipped) {
            this.run.skipped(item);
            this.counts.skipped++;
            this.storeResult(item, 'skipped', durationMs);
        } else {
            this.run.passed(item, durationMs);
            this.counts.passed++;
            this.storeResult(item, 'passed', durationMs);
        }
        this.finished.add(item);

        const group = item.parent ? this.groups.get(item.parent) : undefined;
        if (group) {
            group.duration += durationMs;
            group.allSkipped &&= skipped;
            if (failures && !group.failures) {
                group.failures = failures;
            }
        }
    }

    private finishGroup(item: vscode.TestItem): void {
        const group = this.groups.get(item);
        this.groups.delete(item);
        if (!group) {
            return;
        }
        if (group.failures) {
            this.run.failed(item, group.failures, group.duration);
            this.storeResult(item, 'failed', group.duration, messageText(group.failures[0]));
        } else if (group.allSkipped) {
            this.run.skipped(item);
            this.storeResult(item, 'skipped', group.duration);
        } else {
            this.run.passed(item, group.duration);
            this.storeResult(item, 'passed', group.duration);
        }
        this.finished.add(item);
    }

    private buildFailureMessage(item: vscode.TestItem, event: TeamcityResult): vscode.TestMessage {
        const text = event.message || 'Test failed';
        const full = event.details ? `${text}\n\n${event.details.trim()}` : text;
        const message = event.type === 'comparisonFailure' && event.expected !== undefined && event.actual !== undefined
            ? vscode.TestMessage.diff(full, event.expected, event.actual)
            : new vscode.TestMessage(full);

        const file = this.tree.getData(item)?.file;
        const errorLine = file && event.details ? extractErrorLineFromStackTrace(event.details, file) : 0;
        if (item.uri && errorLine > 0) {
            message.location = new vscode.Location(item.uri, new vscode.Position(errorLine - 1, 0));
        } else if (item.uri && item.range) {
            message.location = new vscode.Location(item.uri, item.range.start);
        }
        return message;
    }

    /**
     * Find the item of a Teamcity event from its locationHint ("tests\Unit\FooTest.php::`Group` → it works")
     */
    private resolveItem(event: TeamcityResult): vscode.TestItem | undefined {
        const description = event.description;
        if (!event.file || !description) {
            return undefined;
        }
        const file = this.toAbsolute(event.file);

        let item = this.lookup(file, description);
        if (!item && !this.parsedFiles.has(file)) {
            this.parsedFiles.add(file);
            this.ensureFileParsed(file);
            item = this.lookup(file, description);
        }
        if (!item) {
            // Name built at runtime: show it anyway so its result isn't lost
            const base = stripDatasetSuffix(description);
            const adHoc = this.tree.ensureAdHocItem(this.projectRoot, file, base);
            item = base === description ? adHoc : this.tree.ensureDatasetItem(adHoc, description, datasetLabel(description, base));
        }
        return item;
    }

    private lookup(file: string, description: string): vscode.TestItem | undefined {
        const exact = this.tree.findById(testItemId(file, description));
        if (exact) {
            return exact;
        }
        const base = stripDatasetSuffix(description);
        if (base !== description) {
            const parent = this.tree.findById(testItemId(file, base));
            if (parent) {
                return this.tree.ensureDatasetItem(parent, description, datasetLabel(description, base));
            }
        }
        return undefined;
    }

    private toAbsolute(file: string): string {
        if (path.isAbsolute(file)) {
            return file;
        }
        return path.resolve(this.projectRoot, file.replace(/[\\/]/g, path.sep));
    }

    private storeResult(item: vscode.TestItem, status: TestStatus, durationMs?: number, message?: string): void {
        const file = this.tree.getData(item)?.file;
        if (!file) {
            return;
        }
        this.store.set(fileItemId(file), item.id, {
            status,
            duration: durationMs !== undefined ? durationMs / 1000 : undefined,
            message,
        });
    }
}

function datasetLabel(description: string, base: string): string {
    const label = description.slice(base.length + DATASET_SEPARATOR.length);
    return label.startsWith('"') && label.endsWith('"') ? label.slice(1, -1) : label;
}

function messageText(message: vscode.TestMessage): string {
    return typeof message.message === 'string' ? message.message : message.message.value;
}
