/**
 * Build the Pest command line for a run.
 *
 * Commands are spawned without a shell: no quoting/escaping issues with test names
 * (quotes, %, &, unicode), and no cmd.exe / bash startup on every run.
 * Test files are passed relative to the project root with forward slashes, which keeps
 * Docker / Sail / WSL commands working without path mappings (their working directory
 * maps to the project root).
 */

import * as path from 'path';
import { findPestScript, PEST_SCRIPTS } from '../project/projectResolver';

export interface RunnerSettings {
    /**
     * Full command, e.g. "docker compose exec -T app php vendor/bin/pest", or just a PHP executable
     * ("C:\php\php.exe", the Pest script is added) ('' = php vendor/pestphp/pest/bin/pest)
     */
    command: string;
    additionalArgs: string[];
    env: Record<string, string>;
    disableXdebug: boolean;
}

export interface PestCommand {
    command: string;
    args: string[];
    cwd: string;
    /** Extra environment variables for the process (merged into process.env by the caller) */
    env: Record<string, string>;
    /** True when PHP doesn't run locally (Docker, WSL, Sail...): Xdebug tweaks and debugging don't apply */
    isCustom: boolean;
}

export interface PestTarget {
    /** Absolute paths of the test files to run (empty = whole suite) */
    files: string[];
    /** Pest descriptions of the tests to run (see ParsedTest.pestId) */
    tests?: string[];
    /** Pest descriptions of the describe blocks to run */
    describes?: string[];
}

/** Above this length the filter is dropped and whole files run (Windows command line limit is 32k) */
export const MAX_FILTER_LENGTH = 8000;

/**
 * Build the command, arguments and environment to run Pest for a target
 */
export function buildPestCommand(
    settings: RunnerSettings,
    projectRoot: string,
    workspaceFolder: string | undefined,
    target: PestTarget
): PestCommand {
    const base = resolveBaseCommand(settings, projectRoot, workspaceFolder);
    const args = [...base.args];

    for (const file of target.files) {
        args.push(toProjectRelative(projectRoot, file));
    }

    args.push('--teamcity');

    const filter = buildFilter(target.tests ?? [], target.describes ?? []);
    if (filter && filter.length <= MAX_FILTER_LENGTH) {
        args.push('--filter', filter);
    }

    args.push(...settings.additionalArgs);

    const env: Record<string, string> = { ...settings.env };
    if (settings.disableXdebug && !base.isCustom && env.XDEBUG_MODE === undefined) {
        // Xdebug (develop/debug/coverage modes) slows every test down; it is only needed for the Debug profile
        env.XDEBUG_MODE = 'off';
    }

    return { command: base.command, args, cwd: projectRoot, env, isCustom: base.isCustom };
}

/**
 * Resolve the executable and its leading arguments (before files and options)
 */
export function resolveBaseCommand(
    settings: RunnerSettings,
    projectRoot: string,
    workspaceFolder: string | undefined
): { command: string; args: string[]; isCustom: boolean } {
    const substitute = (value: string) => value
        .replace(/\$\{projectRoot\}/g, projectRoot)
        .replace(/\$\{workspaceFolder\}/g, workspaceFolder ?? projectRoot);

    const script = findPestScript(projectRoot) ?? PEST_SCRIPTS[0];

    if (settings.command.trim()) {
        const [command, ...args] = splitCommandLine(substitute(settings.command));
        const isPhp = isPhpExecutable(command);
        // Only PHP given ("C:\php\php.exe", "php -d memory_limit=1G"): add the project's Pest script
        if (isPhp && !args.some(arg => /^pest$/i.test(baseName(arg)))) {
            args.push(script);
        }
        return { command: resolveExecutable(command, projectRoot), args, isCustom: !isPhp };
    }

    return { command: 'php', args: [script], isCustom: false };
}

function isPhpExecutable(command: string): boolean {
    return /^php[\d.]*(\.exe)?$/i.test(baseName(command));
}

/** Last path segment, for Windows and POSIX paths alike (settings may hold a Windows path on any OS) */
function baseName(value: string): string {
    return value.split(/[\\/]/).pop() ?? value;
}

/**
 * Relative executables ("./vendor/bin/sail") are resolved against the project root;
 * bare names ("php", "docker", "wsl") are left to the PATH lookup.
 */
function resolveExecutable(command: string, projectRoot: string): string {
    if (/^\.\.?[\\/]/.test(command)) {
        return path.resolve(projectRoot, command);
    }
    return command;
}

/**
 * Path of a file relative to the project root, with forward slashes
 * (absolute when the file is outside the project)
 */
export function toProjectRelative(projectRoot: string, file: string): string {
    const relative = path.relative(projectRoot, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return file;
    }
    return relative.split(path.sep).join('/');
}

/**
 * Split a command line into tokens, honouring "double" and 'single' quotes.
 * Backslashes are kept literally (Windows paths).
 */
export function splitCommandLine(commandLine: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: string | null = null;
    let hasToken = false;

    for (const char of commandLine.trim()) {
        if (quote) {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
        } else if (char === '"' || char === "'") {
            quote = char;
            hasToken = true;
        } else if (/\s/.test(char)) {
            if (hasToken) {
                tokens.push(current);
                current = '';
                hasToken = false;
            }
        } else {
            current += char;
            hasToken = true;
        }
    }

    if (hasToken) {
        tokens.push(current);
    }
    return tokens;
}

/**
 * Escape a string for a PCRE pattern delimited by "/" (like PHP's preg_quote($s, '/'))
 */
export function escapeRegex(value: string): string {
    return value.replace(/[.\\+*?[^\]$(){}=!<>|:\-#/@]/g, '\\$&');
}

/**
 * Build a delimited regex for Pest's --filter.
 *
 * Pest matches the filter against "<Printable class>::<description><dataset>", e.g.
 * "Tests\Unit\FooTest::`Group` → it works with data set "(1)"". A delimited pattern is used as-is
 * by Pest; undelimited ones get reinterpreted ("#1" and "@x" are read as dataset selectors).
 */
export function buildFilter(tests: string[], describes: string[]): string | undefined {
    const alternatives: string[] = [];

    if (tests.length > 0) {
        alternatives.push(`(?:${tests.map(escapeRegex).join('|')})(?: with data set .*)?$`);
    }
    if (describes.length > 0) {
        // Every test inside the block (and nested blocks) starts with "`Name` → "
        alternatives.push(`(?:${describes.map(escapeRegex).join('|')}) → `);
    }

    if (alternatives.length === 0) {
        return undefined;
    }

    const body = alternatives.length === 1 ? alternatives[0] : `(?:${alternatives.join('|')})`;
    return `/::${body}/`;
}
