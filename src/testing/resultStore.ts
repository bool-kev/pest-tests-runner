/**
 * Last known result of each test, for the CodeLens titles.
 * (The Testing API doesn't let extensions read results back, so they are mirrored here.)
 *
 * Change notifications are coalesced: a run reporting hundreds of tests triggers at most
 * one notification every UI_UPDATE_MS, carrying the set of files that changed.
 */

import * as vscode from 'vscode';
import { TestStatus } from '../utils/testResultTypes';
import { throttle } from '../utils/throttle';

export interface StoredResult {
    status: TestStatus;
    /** Duration in seconds */
    duration?: number;
    message?: string;
}

const UI_UPDATE_MS = 100;

export class ResultStore implements vscode.Disposable {
    private readonly results = new Map<string, StoredResult>();
    private pendingFiles = new Set<string>();

    private readonly _onDidChange = new vscode.EventEmitter<ReadonlySet<string>>();
    /** Fired with the ids (normalized paths) of the files whose results changed */
    public readonly onDidChange = this._onDidChange.event;

    private readonly notify = throttle(() => {
        if (this.pendingFiles.size === 0) {
            return;
        }
        const files = this.pendingFiles;
        this.pendingFiles = new Set();
        this._onDidChange.fire(files);
    }, UI_UPDATE_MS);

    /**
     * @param fileId normalized path of the file the test belongs to
     * @param testId id of the test item
     */
    public set(fileId: string, testId: string, result: StoredResult): void {
        const previous = this.results.get(testId);
        if (previous && previous.status === result.status && previous.duration === result.duration &&
            previous.message === result.message) {
            return;
        }
        this.results.set(testId, result);
        this.pendingFiles.add(fileId);
        this.notify();
    }

    public get(testId: string): StoredResult | undefined {
        return this.results.get(testId);
    }

    /**
     * Combined status of several tests (a describe block or a file).
     * Tests that never ran are ignored; undefined when none of them has a result.
     */
    public aggregate(testIds: Iterable<string>): StoredResult | undefined {
        let count = 0;
        let duration = 0;
        let hasRunning = false;
        let hasFailed = false;
        let allSkipped = true;

        for (const id of testIds) {
            const result = this.results.get(id);
            if (!result || result.status === 'none') {
                continue;
            }
            count++;
            duration += result.duration ?? 0;
            hasRunning ||= result.status === 'running' || result.status === 'queued';
            hasFailed ||= result.status === 'failed' || result.status === 'errored';
            allSkipped &&= result.status === 'skipped';
        }

        if (count === 0) {
            return undefined;
        }

        const status: TestStatus = hasRunning ? 'running' : hasFailed ? 'failed' : allSkipped ? 'skipped' : 'passed';
        return { status, duration: duration > 0 ? duration : undefined };
    }

    /** Flush pending notifications immediately (end of a run) */
    public flush(): void {
        this.notify.flush();
    }

    public dispose(): void {
        this.notify.cancel();
        this._onDidChange.dispose();
    }
}
