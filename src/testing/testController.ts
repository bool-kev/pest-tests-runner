/**
 * Pest integration with the VS Code Testing API: discovery, Run/Debug profiles and execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectResolver, findPestScript } from '../project/projectResolver';
import { buildPestCommand, PestCommand, PestTarget, resolveBaseCommand, RunnerSettings } from '../runner/commandBuilder';
import { runPestProcess, PestProcessResult } from '../runner/pestProcess';
import { parsePhpCached } from '../utils/astWorker';
import { formatErrorMessage, getStatusIcon } from '../utils/testResultTypes';
import { ResultStore } from './resultStore';
import { RunSession } from './runSession';
import { forEachLeaf, normalizePath, TestTree } from './testTree';

const CONFIG = 'pest-tests-runner';
const DEFAULT_TEST_GLOB = '{**/tests/**/*.php,**/Tests/**/*.php,**/*Test.php}';
const PARSE_DEBOUNCE_MS = 400;
const EXCLUDED_DIRS = /[\\/](vendor|node_modules)[\\/]/;

interface FileSelection {
    whole: boolean;
    tests: Set<string>;
    describes: Set<string>;
}

interface Job {
    projectRoot: string;
    workspaceFolder?: string;
    wholeProject: boolean;
    files: Map<string, FileSelection>;
    leaves: Set<vscode.TestItem>;
}

export function readRunnerSettings(scope?: vscode.Uri): RunnerSettings {
    const config = vscode.workspace.getConfiguration(CONFIG, scope);
    return {
        command: config.get<string>('command', ''),
        additionalArgs: config.get<string[]>('additionalArgs', []),
        env: config.get<Record<string, string>>('env', {}),
        disableXdebug: config.get<boolean>('disableXdebug', true),
    };
}

export class PestTestController implements vscode.Disposable {
    public readonly controller: vscode.TestController;
    public readonly tree: TestTree;
    private readonly runProfile: vscode.TestRunProfile;
    private readonly debugProfile: vscode.TestRunProfile;
    /** One active run per project: starting a new one cancels the previous */
    private readonly activeRuns = new Map<string, { cancellation: vscode.CancellationTokenSource; done: Promise<void> }>();
    private readonly parseTimers = new Map<string, NodeJS.Timeout>();
    private readonly disposables: vscode.Disposable[] = [];
    private watcher: vscode.FileSystemWatcher | undefined;
    private discovery: Promise<void> | undefined;

    constructor(
        private readonly resolver: ProjectResolver,
        private readonly store: ResultStore,
        private readonly output: vscode.OutputChannel,
        controllerId = 'pest'
    ) {
        this.controller = vscode.tests.createTestController(controllerId, 'Pest');
        this.tree = new TestTree(this.controller);

        this.runProfile = this.controller.createRunProfile(
            'Run', vscode.TestRunProfileKind.Run, (request, token) => this.runHandler(request, token, false), true
        );
        this.debugProfile = this.controller.createRunProfile(
            'Debug', vscode.TestRunProfileKind.Debug, (request, token) => this.runHandler(request, token, true), true
        );
        this.controller.resolveHandler = item => this.resolve(item);
        this.controller.refreshHandler = () => this.refresh(true);

        this.disposables.push(
            this.controller,
            vscode.workspace.onDidOpenTextDocument(document => this.updateFromDocument(document)),
            vscode.workspace.onDidChangeTextDocument(event => this.scheduleParse(event.document)),
            vscode.workspace.onDidChangeConfiguration(event => this.onConfigurationChanged(event))
        );
        this.createWatcher();

        for (const document of vscode.workspace.textDocuments) {
            this.updateFromDocument(document);
        }
    }

    // ---------------------------------------------------------------- discovery

    public isTestDocument(document: vscode.TextDocument): boolean {
        return document.uri.scheme === 'file' &&
            document.languageId === 'php' &&
            !EXCLUDED_DIRS.test(document.uri.fsPath) &&
            vscode.languages.match({ pattern: this.testFileGlob() }, document) > 0;
    }

    public projectRootFor(file: string): string {
        const uri = vscode.Uri.file(file);
        const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
        const setting = vscode.workspace.getConfiguration(CONFIG, uri).get<string>('projectRoot', '');
        return this.resolver.resolve(file, folder, setting) ?? folder ?? path.dirname(file);
    }

    public updateFromDocument(document: vscode.TextDocument): void {
        if (!this.isTestDocument(document)) {
            return;
        }
        const file = document.uri.fsPath;
        const parsed = parsePhpCached(document.getText(), document.uri.toString(), document.version);
        this.tree.syncFile(this.projectRootFor(file), file, parsed);
    }

    private scheduleParse(document: vscode.TextDocument): void {
        if (document.uri.scheme !== 'file' || document.languageId !== 'php') {
            return;
        }
        const key = document.uri.toString();
        clearTimeout(this.parseTimers.get(key));
        this.parseTimers.set(key, setTimeout(() => {
            this.parseTimers.delete(key);
            this.updateFromDocument(document);
        }, PARSE_DEBOUNCE_MS));
    }

    private async updateFromDisk(uri: vscode.Uri): Promise<void> {
        const open = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
        if (open) {
            this.updateFromDocument(open);
            return;
        }
        let content: string;
        try {
            content = await fs.promises.readFile(uri.fsPath, 'utf8');
        } catch {
            this.tree.removeFile(uri.fsPath);
            return;
        }
        this.tree.syncFile(this.projectRootFor(uri.fsPath), uri.fsPath, parsePhpCached(content, uri.toString()));
    }

    private updateFromDiskSync(file: string): void {
        try {
            const uri = vscode.Uri.file(file);
            const content = fs.readFileSync(file, 'utf8');
            this.tree.syncFile(this.projectRootFor(file), file, parsePhpCached(content, uri.toString()));
        } catch {
            // File reported by Pest but unreadable here (e.g. container-only path): ad-hoc items are used
        }
    }

    private ensureDiscovered(): Promise<void> {
        if (!this.discovery) {
            this.discovery = this.discoverAll();
        }
        return this.discovery;
    }

    private async discoverAll(): Promise<void> {
        const uris = await vscode.workspace.findFiles(this.testFileGlob(), '**/{vendor,node_modules}/**');
        let count = 0;
        for (const uri of uris) {
            if (EXCLUDED_DIRS.test(uri.fsPath)) {
                continue;
            }
            await this.updateFromDisk(uri);
            // Yield regularly so a large workspace doesn't freeze the extension host
            if (++count % 25 === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }
    }

    private async resolve(item: vscode.TestItem | undefined): Promise<void> {
        if (!item) {
            await this.ensureDiscovered();
            return;
        }
        if (this.tree.getData(item)?.kind === 'file' && item.uri) {
            await this.updateFromDisk(item.uri);
        }
    }

    private async refresh(rediscover: boolean): Promise<void> {
        this.resolver.clear();
        const wasDiscovered = this.discovery !== undefined;
        this.discovery = undefined;
        this.controller.items.replace([]);
        for (const document of vscode.workspace.textDocuments) {
            this.updateFromDocument(document);
        }
        if (rediscover || wasDiscovered) {
            await this.ensureDiscovered();
        }
    }

    private createWatcher(): void {
        this.watcher?.dispose();
        this.watcher = vscode.workspace.createFileSystemWatcher(this.testFileGlob());
        this.watcher.onDidCreate(uri => this.onFileChanged(uri));
        this.watcher.onDidChange(uri => this.onFileChanged(uri));
        this.watcher.onDidDelete(uri => this.tree.removeFile(uri.fsPath));
    }

    private onFileChanged(uri: vscode.Uri): void {
        if (EXCLUDED_DIRS.test(uri.fsPath)) {
            return;
        }
        // Open documents are kept in sync by document events
        if (vscode.workspace.textDocuments.some(document => document.uri.toString() === uri.toString())) {
            return;
        }
        if (this.discovery || this.tree.getFileItem(uri.fsPath)) {
            void this.updateFromDisk(uri);
        }
    }

    private onConfigurationChanged(event: vscode.ConfigurationChangeEvent): void {
        if (!event.affectsConfiguration(CONFIG)) {
            return;
        }
        this.resolver.clear();
        if (event.affectsConfiguration(`${CONFIG}.testFileGlob`) || event.affectsConfiguration(`${CONFIG}.projectRoot`)) {
            this.createWatcher();
            void this.refresh(false);
        }
    }

    private testFileGlob(): string {
        return vscode.workspace.getConfiguration(CONFIG).get<string>('testFileGlob', DEFAULT_TEST_GLOB) || DEFAULT_TEST_GLOB;
    }

    // ---------------------------------------------------------------- running

    /**
     * Run (or debug) items by id, e.g. from a CodeLens
     */
    public async runItems(items: vscode.TestItem[] | undefined, debug: boolean): Promise<void> {
        const profile = debug ? this.debugProfile : this.runProfile;
        const request = new vscode.TestRunRequest(items, undefined, profile);
        const tokenSource = new vscode.CancellationTokenSource();
        try {
            await this.runHandler(request, tokenSource.token, debug);
        } finally {
            tokenSource.dispose();
        }
    }

    private async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken, debug: boolean): Promise<void> {
        const runsProjects = !request.include || request.include.some(item => this.tree.getData(item)?.kind === 'project');
        if (runsProjects) {
            await this.ensureDiscovered();
        }

        const include: vscode.TestItem[] = [];
        if (request.include) {
            include.push(...request.include);
        } else {
            this.controller.items.forEach(item => include.push(item));
        }

        const jobs = this.planJobs(include, request.exclude ?? []);
        if (jobs.length === 0) {
            return;
        }

        if (vscode.workspace.getConfiguration(CONFIG).get<boolean>('autoSaveBeforeRun', true)) {
            await this.saveDocuments(jobs);
        }

        if (debug) {
            await this.debugJob(jobs[0]);
            return;
        }

        const run = this.controller.createTestRun(request);
        try {
            // Different projects run in parallel, each in its own process
            await Promise.all(jobs.map(job => this.runJob(run, job, token)));
        } finally {
            run.end();
            this.store.flush();
        }
    }

    /**
     * Group the requested items by project root, and describe what to run in each file
     */
    private planJobs(include: readonly vscode.TestItem[], exclude: readonly vscode.TestItem[]): Job[] {
        const excluded = new Set(exclude.map(item => item.id));
        const isExcluded = (item: vscode.TestItem): boolean => {
            for (let current: vscode.TestItem | undefined = item; current; current = current.parent) {
                if (excluded.has(current.id)) {
                    return true;
                }
            }
            return false;
        };

        const jobs = new Map<string, Job>();
        const jobFor = (projectRoot: string): Job => {
            const key = normalizePath(projectRoot);
            let job = jobs.get(key);
            if (!job) {
                job = {
                    projectRoot,
                    workspaceFolder: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectRoot))?.uri.fsPath,
                    wholeProject: false,
                    files: new Map(),
                    leaves: new Set(),
                };
                jobs.set(key, job);
            }
            return job;
        };
        const selectionFor = (job: Job, file: string): FileSelection => {
            let selection = job.files.get(file);
            if (!selection) {
                selection = { whole: false, tests: new Set(), describes: new Set() };
                job.files.set(file, selection);
            }
            return selection;
        };

        for (const item of include) {
            const data = this.tree.getData(item);
            if (!data || isExcluded(item)) {
                continue;
            }
            const job = jobFor(data.projectRoot);

            const leaves: vscode.TestItem[] = [];
            let hasExcludedLeaf = false;
            forEachLeaf(this.tree, item, leaf => {
                if (isExcluded(leaf)) {
                    hasExcludedLeaf = true;
                } else {
                    leaves.push(leaf);
                }
            });
            leaves.forEach(leaf => job.leaves.add(leaf));

            if (hasExcludedLeaf) {
                // Exclusions inside a group: run the remaining tests one by one
                for (const leaf of leaves) {
                    const leafData = this.tree.getData(leaf)!;
                    selectionFor(job, leafData.file!).tests.add(leafData.pestId!);
                }
                continue;
            }

            switch (data.kind) {
                case 'project':
                    job.wholeProject = true;
                    break;
                case 'file':
                    selectionFor(job, data.file!).whole = true;
                    break;
                case 'describe':
                    selectionFor(job, data.file!).describes.add(data.pestId!);
                    break;
                case 'test':
                case 'dataset':
                    selectionFor(job, data.file!).tests.add(data.pestId!);
                    break;
            }
        }

        return [...jobs.values()];
    }

    /**
     * Process invocations for a job: whole files share one invocation (one PHP/Laravel boot),
     * filtered selections share another.
     */
    private targetsFor(job: Job): PestTarget[] {
        if (job.wholeProject) {
            return [{ files: [] }];
        }
        const wholeFiles: string[] = [];
        const filtered = { files: [] as string[], tests: new Set<string>(), describes: new Set<string>() };
        for (const [file, selection] of job.files) {
            if (selection.whole) {
                wholeFiles.push(file);
            } else {
                filtered.files.push(file);
                selection.tests.forEach(test => filtered.tests.add(test));
                selection.describes.forEach(describe => filtered.describes.add(describe));
            }
        }

        const targets: PestTarget[] = [];
        if (wholeFiles.length > 0) {
            targets.push({ files: wholeFiles });
        }
        if (filtered.files.length > 0) {
            targets.push({ files: filtered.files, tests: [...filtered.tests], describes: [...filtered.describes] });
        }
        return targets;
    }

    private async runJob(run: vscode.TestRun, job: Job, token: vscode.CancellationToken): Promise<void> {
        const key = normalizePath(job.projectRoot);
        const previous = this.activeRuns.get(key);
        const cancellation = new vscode.CancellationTokenSource();
        let markDone: () => void = () => undefined;
        const active = { cancellation, done: new Promise<void>(resolve => markDone = resolve) };
        this.activeRuns.set(key, active);

        const subscriptions = [
            token.onCancellationRequested(() => cancellation.cancel()),
            run.token.onCancellationRequested(() => cancellation.cancel()),
        ];
        if (token.isCancellationRequested || run.token.isCancellationRequested) {
            cancellation.cancel();
        }

        const session = new RunSession(run, this.tree, this.store, job.projectRoot, file => this.updateFromDiskSync(file));
        let lastResult: PestProcessResult | undefined;
        let failureReason: string | undefined;
        try {
            if (previous) {
                // Let the cancelled run settle its tests first, so it can't overwrite this run's states
                previous.cancellation.cancel();
                await previous.done;
            }
            job.leaves.forEach(leaf => session.enqueue(leaf));

            const settings = readRunnerSettings(vscode.Uri.file(job.projectRoot));
            failureReason = this.checkPestInstalled(settings, job);
            if (failureReason) {
                this.reportFailure(failureReason);
                return;
            }

            for (const target of this.targetsFor(job)) {
                if (cancellation.token.isCancellationRequested) {
                    break;
                }
                const command = buildPestCommand(settings, job.projectRoot, job.workspaceFolder, target);
                this.log(`▶ ${formatCommand(command)}`);
                this.log(`  cwd: ${command.cwd}`);

                lastResult = await runPestProcess(command, {
                    onEvent: event => session.handleEvent(event),
                    onOutput: text => session.handleOutput(text),
                }, cancellation.token);

                this.logResult(lastResult, session);
                if (!lastResult.cancelled && (lastResult.spawnError || (lastResult.eventCount === 0 && lastResult.exitCode !== 0))) {
                    this.reportFailure(lastResult.spawnError
                        ? `Could not start "${command.command}": ${lastResult.spawnError.message}`
                        : `Pest exited with code ${lastResult.exitCode} without running any test. ${formatErrorMessage(lastResult.stderr, 200)}`);
                }
            }
        } finally {
            session.finalize(job.leaves, lastResult, cancellation.token.isCancellationRequested, failureReason);
            subscriptions.forEach(subscription => subscription.dispose());
            if (this.activeRuns.get(key) === active) {
                this.activeRuns.delete(key);
            }
            cancellation.dispose();
            markDone();
        }
    }

    /**
     * Fail fast with a helpful message when Pest isn't installed where we expect it
     */
    private checkPestInstalled(settings: RunnerSettings, job: Job): string | undefined {
        if (settings.command.trim() || findPestScript(job.projectRoot)) {
            return undefined;
        }
        return `Pest was not found in "${job.projectRoot}" (looked for vendor/pestphp/pest/bin/pest from the test file upward). ` +
            'Run "composer install", or set "pest-tests-runner.projectRoot" / "pest-tests-runner.command".';
    }

    private async debugJob(job: Job): Promise<void> {
        const settings = readRunnerSettings(vscode.Uri.file(job.projectRoot));
        const base = resolveBaseCommand(settings, job.projectRoot, job.workspaceFolder);
        if (base.isCustom || base.args.length === 0) {
            vscode.window.showWarningMessage(
                'Pest debugging needs a local PHP. With Docker/WSL, start the debug session from a launch configuration with path mappings.'
            );
            return;
        }

        const target = this.targetsFor(job).find(candidate => candidate.tests?.length || candidate.describes?.length) ?? this.targetsFor(job)[0];
        const command = buildPestCommand({ ...settings, disableXdebug: false }, job.projectRoot, job.workspaceFolder, target);
        const [script, ...args] = command.args;

        const label = job.leaves.size === 1 ? [...job.leaves][0].label : path.basename(job.projectRoot);
        const debugConfig: vscode.DebugConfiguration = {
            type: 'php',
            request: 'launch',
            name: `Pest: ${label}`,
            program: path.resolve(job.projectRoot, script),
            // Teamcity output is only useful for the result stream, not in the debug console
            args: args.filter(arg => arg !== '--teamcity'),
            cwd: job.projectRoot,
            env: { ...settings.env, XDEBUG_MODE: 'debug' },
            ...(base.command !== 'php' ? { runtimeExecutable: base.command } : {}),
        };

        this.log(`🐛 Debugging ${label}`);
        try {
            const folder = job.workspaceFolder ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(job.workspaceFolder)) : undefined;
            const started = await vscode.debug.startDebugging(folder, debugConfig);
            if (!started) {
                vscode.window.showErrorMessage('Failed to start the debugger. Make sure the PHP Debug extension is installed and Xdebug is configured.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Debugger error: ${error}`);
        }
    }

    private async saveDocuments(jobs: Job[]): Promise<void> {
        const roots = jobs.filter(job => job.wholeProject).map(job => normalizePath(job.projectRoot) + path.sep);
        const files = new Set(jobs.flatMap(job => [...job.files.keys()].map(normalizePath)));
        const dirty = vscode.workspace.textDocuments.filter(document => {
            if (!document.isDirty || document.uri.scheme !== 'file') {
                return false;
            }
            const file = normalizePath(document.uri.fsPath);
            return files.has(file) || roots.some(root => file.startsWith(root));
        });
        await Promise.all(dirty.map(document => document.save()));
    }

    // ---------------------------------------------------------------- reporting

    private log(message: string): void {
        this.output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    private logResult(result: PestProcessResult, session: RunSession): void {
        if (result.usedShell) {
            this.log('  ⚠️ Started through a shell (.bat/.cmd). Use the full path of php.exe in "pest-tests-runner.command" for faster, safer runs.');
        }
        for (const failure of session.failedTests.splice(0)) {
            this.output.appendLine(`  ${getStatusIcon('failed')} ${failure.label}: ${formatErrorMessage(failure.message, 120)}`);
        }
        const { passed, failed, skipped } = session.counts;
        const firstResult = result.firstEventMs !== undefined ? `, first result after ${result.firstEventMs}ms` : '';
        const status = result.cancelled ? 'cancelled' : `exit code ${result.exitCode}`;
        this.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped in ${result.totalMs}ms${firstResult} (${status})`);
    }

    private reportFailure(message: string): void {
        this.log(`❌ ${message}`);
        void vscode.window.showErrorMessage(message, 'Show Output', 'Open Settings').then(choice => {
            if (choice === 'Show Output') {
                this.output.show(true);
            } else if (choice === 'Open Settings') {
                void vscode.commands.executeCommand('workbench.action.openSettings', CONFIG);
            }
        });
    }

    public dispose(): void {
        this.parseTimers.forEach(timer => clearTimeout(timer));
        this.activeRuns.forEach(active => active.cancellation.cancel());
        this.watcher?.dispose();
        this.disposables.forEach(disposable => disposable.dispose());
    }
}

function formatCommand(command: PestCommand): string {
    const quote = (arg: string) => /[\s"'`→]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
    const env = Object.entries(command.env).map(([name, value]) => `${name}=${value} `).join('');
    return env + [command.command, ...command.args].map(quote).join(' ');
}
