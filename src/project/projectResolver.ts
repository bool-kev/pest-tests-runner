/**
 * Locate the Pest project a test file belongs to.
 *
 * The project root (where vendor/, composer.json and phpunit.xml live) is not necessarily the
 * VS Code workspace folder: opening a parent folder or a monorepo puts it deeper in the tree.
 * Pest must be launched from that root, otherwise vendor/bin/pest, phpunit.xml and tests/Pest.php
 * are not found.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Pest entry points, in order of preference (both are PHP scripts, no .bat wrapper needed) */
export const PEST_SCRIPTS = ['vendor/pestphp/pest/bin/pest', 'vendor/bin/pest'];

const PHPUNIT_CONFIGS = ['phpunit.xml', 'phpunit.xml.dist', 'phpunit.dist.xml'];

/**
 * Return the Pest script of a project root, relative to that root with forward slashes
 */
export function findPestScript(root: string): string | undefined {
    return PEST_SCRIPTS.find(script => fs.existsSync(path.join(root, script)));
}

function looksLikePhpProject(dir: string): boolean {
    return fs.existsSync(path.join(dir, 'composer.json')) &&
        PHPUNIT_CONFIGS.some(config => fs.existsSync(path.join(dir, config)));
}

/**
 * Expand ${workspaceFolder} and resolve relative paths against the workspace folder
 */
export function expandProjectRootSetting(setting: string, workspaceFolder: string | undefined): string | undefined {
    const trimmed = setting.trim();
    if (!trimmed) {
        return undefined;
    }
    const expanded = trimmed.replace(/\$\{workspaceFolder\}/g, workspaceFolder ?? '');
    if (path.isAbsolute(expanded)) {
        return path.normalize(expanded);
    }
    return workspaceFolder ? path.resolve(workspaceFolder, expanded) : undefined;
}

export class ProjectResolver {
    /** directory -> project root (failures aren't cached: `composer install` may fix them later) */
    private cache = new Map<string, string>();

    /**
     * @param filePath absolute path of a test file
     * @param workspaceFolder workspace folder containing the file, if any
     * @param rootSetting value of the `projectRoot` setting ('' = auto-detect)
     */
    public resolve(filePath: string, workspaceFolder?: string, rootSetting = ''): string | undefined {
        const configured = expandProjectRootSetting(rootSetting, workspaceFolder);
        if (configured) {
            return configured;
        }

        const startDir = path.dirname(filePath);
        const cached = this.cache.get(startDir);
        if (cached !== undefined) {
            return cached;
        }

        // Prefer a directory with Pest installed; fall back to a composer + phpunit.xml project
        // (vendor not installed yet), so the error message can point at the right folder.
        const root = this.walkUp(startDir, findPestScript) ?? this.walkUp(startDir, looksLikePhpProject);
        if (root) {
            this.cache.set(startDir, root);
        }
        return root;
    }

    public clear(): void {
        this.cache.clear();
    }

    private walkUp(startDir: string, matches: (dir: string) => unknown): string | undefined {
        let dir = startDir;
        for (;;) {
            if (matches(dir)) {
                return dir;
            }
            const parent = path.dirname(dir);
            if (parent === dir) {
                return undefined;
            }
            dir = parent;
        }
    }
}
