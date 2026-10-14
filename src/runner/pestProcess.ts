/**
 * Spawn Pest and stream its Teamcity output line by line.
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { parseTeamcityLine, TeamcityResult } from '../teamcityParser';
import { PestCommand } from './commandBuilder';

export interface PestProcessHandlers {
    /** A Teamcity service message */
    onEvent(event: TeamcityResult): void;
    /** Any other output (stdout lines that are not service messages, stderr), with \r\n line endings */
    onOutput(text: string): void;
}

/** Structural subset of vscode.CancellationToken, so this module stays testable without VS Code */
export interface CancellationLike {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(listener: () => void): { dispose(): void };
}

export interface PestProcessResult {
    exitCode: number | null;
    /** Tail of stderr, for error reporting */
    stderr: string;
    /** Set when the process could not be started at all */
    spawnError?: Error;
    cancelled: boolean;
    eventCount: number;
    /** Milliseconds from spawn to the first Teamcity event (undefined if none) */
    firstEventMs?: number;
    totalMs: number;
    /** True when the command had to go through a shell (Windows .bat/.cmd) */
    usedShell: boolean;
}

const STDERR_LIMIT = 16 * 1024;

export function runPestProcess(
    command: PestCommand,
    handlers: PestProcessHandlers,
    token?: CancellationLike
): Promise<PestProcessResult> {
    const needsShell = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command.command);
    return spawnOnce(command, handlers, token, needsShell).then(result => {
        // On Windows, "php" may be a php.bat shim (Herd, Scoop...) that only a shell can start
        if (result.spawnError && (result.spawnError as NodeJS.ErrnoException).code === 'ENOENT' &&
            process.platform === 'win32' && !result.usedShell) {
            return spawnOnce(command, handlers, token, true);
        }
        return result;
    });
}

function spawnOnce(
    command: PestCommand,
    handlers: PestProcessHandlers,
    token: CancellationLike | undefined,
    useShell: boolean
): Promise<PestProcessResult> {
    return new Promise(resolve => {
        const startedAt = Date.now();
        let firstEventMs: number | undefined;
        let eventCount = 0;
        let stderr = '';
        let buffer = '';
        let cancelled = false;
        let spawnError: Error | undefined;

        const options: SpawnOptions = {
            cwd: command.cwd,
            env: { ...process.env, ...command.env },
            windowsHide: true,
            // Own process group on Unix so cancellation also stops --parallel workers
            detached: process.platform !== 'win32',
        };

        let child: ChildProcess;
        try {
            child = useShell
                ? spawn([command.command, ...command.args].map(quoteForCmd).join(' '), { ...options, shell: true })
                : spawn(command.command, command.args, { ...options, shell: false });
        } catch (error) {
            resolve({
                exitCode: null, stderr: '', spawnError: error as Error, cancelled: false,
                eventCount: 0, totalMs: 0, usedShell: useShell,
            });
            return;
        }

        const handleLine = (rawLine: string) => {
            const line = rawLine.replace(/\r$/, '');
            const event = line.includes('##teamcity[') ? parseTeamcityLine(line) : null;
            if (event) {
                if (firstEventMs === undefined) {
                    firstEventMs = Date.now() - startedAt;
                }
                eventCount++;
                handlers.onEvent(event);
            } else {
                handlers.onOutput(line + '\r\n');
            }
        };

        // setEncoding uses a StringDecoder: multi-byte characters split across chunks stay intact
        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                handleLine(line);
            }
        });

        child.stderr?.setEncoding('utf8');
        child.stderr?.on('data', (chunk: string) => {
            stderr = (stderr + chunk).slice(-STDERR_LIMIT);
            handlers.onOutput(chunk.replace(/\r?\n/g, '\r\n'));
        });

        const cancellation = token?.onCancellationRequested(() => {
            cancelled = true;
            killProcessTree(child);
        });
        if (token?.isCancellationRequested) {
            cancelled = true;
            killProcessTree(child);
        }

        child.on('error', error => {
            spawnError = error;
        });

        child.on('close', exitCode => {
            if (buffer) {
                handleLine(buffer);
                buffer = '';
            }
            cancellation?.dispose();
            resolve({
                exitCode,
                stderr,
                spawnError,
                cancelled,
                eventCount,
                firstEventMs,
                totalMs: Date.now() - startedAt,
                usedShell: useShell,
            });
        });
    });
}

/**
 * Kill the process and its children (Pest --parallel workers, php launched by a .bat...)
 */
export function killProcessTree(child: ChildProcess): void {
    if (child.pid === undefined || child.exitCode !== null) {
        return;
    }
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        } else {
            process.kill(-child.pid, 'SIGTERM');
        }
    } catch {
        child.kill();
    }
}

/**
 * Quote an argument for cmd.exe (only used for the .bat/.cmd fallback)
 */
export function quoteForCmd(arg: string): string {
    if (arg && !/[\s"&|<>^%!()]/.test(arg)) {
        return arg;
    }
    return `"${arg.replace(/"/g, '""')}"`;
}
