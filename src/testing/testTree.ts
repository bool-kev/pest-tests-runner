/**
 * Test item identity and tree synchronisation.
 *
 * Every component (Test Explorer, CodeLens, result store, Teamcity events) refers to tests with
 * the same id: "<normalized file path>::<Pest description>". Pest prints that description in the
 * Teamcity locationHint, so results map back to items with a single lookup, whatever describe
 * nesting, `it` prefix or dataset they have.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { ParsedTest } from '../phpAstParser';

export type ItemKind = 'project' | 'file' | 'describe' | 'test' | 'dataset';

export interface ItemData {
    kind: ItemKind;
    projectRoot: string;
    /** Absolute path of the test file (all kinds except project) */
    file?: string;
    /** Pest description (describe, test and dataset kinds) */
    pestId?: string;
    /** Methods chained on the test call (->with(), ->todo()...) */
    modifiers?: string[];
}

/**
 * Normalize a path for use as a key: resolved, and lower-cased on Windows where the
 * same file can show up as "d:\x" and "D:\X"
 */
export function normalizePath(filePath: string): string {
    const normalized = path.normalize(filePath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function projectItemId(projectRoot: string): string {
    return `project:${normalizePath(projectRoot)}`;
}

export function fileItemId(file: string): string {
    return normalizePath(file);
}

export function testItemId(file: string, pestId: string): string {
    return `${normalizePath(file)}::${pestId}`;
}

/**
 * Keeps TestItems in sync with parsed files and remembers what each item represents
 */
export class TestTree {
    private readonly data = new WeakMap<vscode.TestItem, ItemData>();

    constructor(private readonly controller: vscode.TestController) { }

    public getData(item: vscode.TestItem): ItemData | undefined {
        return this.data.get(item);
    }

    public getProjectItem(projectRoot: string): vscode.TestItem {
        const id = projectItemId(projectRoot);
        let item = this.controller.items.get(id);
        if (!item) {
            item = this.controller.createTestItem(id, path.basename(projectRoot) || projectRoot);
            item.description = projectRoot;
            this.data.set(item, { kind: 'project', projectRoot });
            this.controller.items.add(item);
        }
        return item;
    }

    public getFileItem(file: string): vscode.TestItem | undefined {
        for (const [, project] of this.controller.items) {
            const item = project.children.get(fileItemId(file));
            if (item) {
                return item;
            }
        }
        return undefined;
    }

    /**
     * Create (or return) the item of a test file, without its children
     */
    public ensureFileItem(projectRoot: string, file: string): vscode.TestItem {
        const project = this.getProjectItem(projectRoot);
        const id = fileItemId(file);
        let item = project.children.get(id);
        if (!item) {
            const relative = path.relative(projectRoot, file).split(path.sep).join('/');
            item = this.controller.createTestItem(id, relative || path.basename(file), vscode.Uri.file(file));
            item.sortText = relative;
            item.canResolveChildren = true;
            this.data.set(item, { kind: 'file', projectRoot, file });
            project.children.add(item);
        }
        return item;
    }

    /**
     * Replace the children of a file with freshly parsed tests.
     * Existing items are reused (same object), so running tests and their results survive edits.
     * Returns false (and removes the file) when it contains no tests.
     */
    public syncFile(projectRoot: string, file: string, parsedTests: ParsedTest[]): boolean {
        if (parsedTests.length === 0) {
            this.removeFile(file);
            return false;
        }

        const fileItem = this.ensureFileItem(projectRoot, file);
        fileItem.canResolveChildren = false;

        const previous = new Map<string, vscode.TestItem>();
        collectDescendants(fileItem, previous);

        const uri = vscode.Uri.file(file);
        const childrenOf = new Map<vscode.TestItem, vscode.TestItem[]>([[fileItem, []]]);
        const byPestId = new Map<string, vscode.TestItem>();

        for (const parsed of parsedTests) {
            const id = testItemId(file, parsed.pestId);
            let item = previous.get(id);
            if (!item) {
                item = this.controller.createTestItem(id, parsed.name, uri);
            }
            item.label = parsed.name;
            item.range = new vscode.Range(parsed.line, 0, parsed.endLine, 0);
            item.sortText = String(parsed.line).padStart(6, '0');
            this.data.set(item, {
                kind: parsed.type === 'describe' ? 'describe' : 'test',
                projectRoot,
                file,
                pestId: parsed.pestId,
                modifiers: parsed.modifiers,
            });
            byPestId.set(parsed.pestId, item);

            const parentId = parentPestId(parsed);
            const parent = (parentId && byPestId.get(parentId)) || fileItem;
            if (!childrenOf.has(parent)) {
                childrenOf.set(parent, []);
            }
            childrenOf.get(parent)!.push(item);
            if (parsed.type === 'describe' && !childrenOf.has(item)) {
                childrenOf.set(item, []);
            }
        }

        // Only file and describe children are replaced; dataset children of tests are kept
        for (const [parent, children] of childrenOf) {
            parent.children.replace(children);
        }
        return true;
    }

    /**
     * Get or create the item of one dataset case under its test
     */
    public ensureDatasetItem(testItem: vscode.TestItem, fullDescription: string, label: string): vscode.TestItem {
        const parentData = this.data.get(testItem)!;
        const id = testItemId(parentData.file!, fullDescription);
        let item = testItem.children.get(id);
        if (!item) {
            item = this.controller.createTestItem(id, label, testItem.uri);
            item.range = testItem.range;
            this.data.set(item, { ...parentData, kind: 'dataset', pestId: fullDescription });
            testItem.children.add(item);
        }
        return item;
    }

    /**
     * Item for a test Pest reported but the parser couldn't see (dynamic names...)
     */
    public ensureAdHocItem(projectRoot: string, file: string, description: string): vscode.TestItem {
        const fileItem = this.ensureFileItem(projectRoot, file);
        const id = testItemId(file, description);
        let item = fileItem.children.get(id);
        if (!item) {
            item = this.controller.createTestItem(id, description, vscode.Uri.file(file));
            this.data.set(item, { kind: 'test', projectRoot, file, pestId: description, modifiers: [] });
            fileItem.children.add(item);
        }
        return item;
    }

    public findById(id: string): vscode.TestItem | undefined {
        const separator = id.indexOf('::');
        const fileId = separator === -1 ? id : id.slice(0, separator);
        for (const [, project] of this.controller.items) {
            const fileItem = project.children.get(fileId);
            if (fileItem) {
                return separator === -1 ? fileItem : findDescendant(fileItem, id);
            }
        }
        return undefined;
    }

    public removeFile(file: string): void {
        for (const [, project] of this.controller.items) {
            if (project.children.get(fileItemId(file))) {
                project.children.delete(fileItemId(file));
                if (project.children.size === 0) {
                    this.controller.items.delete(project.id);
                }
                return;
            }
        }
    }
}

function parentPestId(parsed: ParsedTest): string | undefined {
    if (parsed.parents.length === 0) {
        return undefined;
    }
    return parsed.parents.map(name => `\`${name}\``).join(' → ');
}

function collectDescendants(item: vscode.TestItem, into: Map<string, vscode.TestItem>): void {
    item.children.forEach(child => {
        into.set(child.id, child);
        collectDescendants(child, into);
    });
}

function findDescendant(item: vscode.TestItem, id: string): vscode.TestItem | undefined {
    const direct = item.children.get(id);
    if (direct) {
        return direct;
    }
    let found: vscode.TestItem | undefined;
    item.children.forEach(child => {
        if (!found && id.startsWith(child.id)) {
            found = findDescendant(child, id);
        }
    });
    return found;
}

/**
 * Visit every leaf test (tests and datasets, not describes/files) under an item
 */
export function forEachLeaf(tree: TestTree, item: vscode.TestItem, visit: (leaf: vscode.TestItem) => void): void {
    const kind = tree.getData(item)?.kind;
    if (kind === 'test' || kind === 'dataset') {
        visit(item);
        return;
    }
    item.children.forEach(child => forEachLeaf(tree, child, visit));
}
