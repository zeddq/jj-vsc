import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'path';

export interface FileStatus {
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'moved';
}

export interface StatusSummary {
    modified: FileStatus[];
    added: FileStatus[];
    deleted: FileStatus[];
    moved: FileStatus[];
}

/**
 * Custom error class for JJ command execution failures
 */
export class JjExecutionError extends Error {
    constructor(
        message: string,
        public readonly command: string,
        public readonly args: string[],
        public readonly stderr?: string,
        public readonly exitCode?: number,
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = 'JjExecutionError';
        
        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, JjExecutionError);
        }
    }
}

const execFileAsync = promisify(execFile);

/**
 * Execute a jj command with improved error handling
 * @param args Command arguments
 * @param options Execution options
 * @returns Command output
 * @throws {JjExecutionError} When command execution fails
 */
export async function execJj(args: string[], { cwd }: { cwd: string }): Promise<string> {
    const command = 'jj';
    
    try {
        const { stdout, stderr } = await execFileAsync(command, args, { 
            cwd,
            encoding: 'utf8',
            // Add timeout to prevent hanging
            timeout: 30000 // 30 seconds
        });
        
        // Some jj commands write warnings to stderr even on success
        // Log them but don't fail
        if (stderr.trim() !== '') {
            console.warn(`jj command warning: ${stderr.trim()}`);
        }
        
        return stdout.trim();
    } catch (err) {
        // Handle different types of errors
        if (err && typeof err === 'object' && 'code' in err) {
            const errorWithCode = err as NodeJS.ErrnoException & { 
                stderr?: string; 
                stdout?: string;
                signal?: string;
            };
            
            // Command not found
            if (errorWithCode.code === 'ENOENT') {
                throw new JjExecutionError(
                    'JuJutsu (jj) is not installed or not found in PATH',
                    command,
                    args,
                    undefined,
                    undefined,
                    err
                );
            }
            
            // Command timed out
            if (errorWithCode.code === 'ETIMEDOUT' || errorWithCode.signal === 'SIGTERM') {
                throw new JjExecutionError(
                    `JuJutsu command timed out after 30 seconds`,
                    command,
                    args,
                    errorWithCode.stderr,
                    undefined,
                    err
                );
            }
            
            // Command executed but returned non-zero exit code
            if (errorWithCode.code && typeof errorWithCode.code === 'number') {
                const stderr = errorWithCode.stderr || '';
                const exitCode = errorWithCode.code;
                
                // Try to extract meaningful error message from stderr
                let message = `JuJutsu command failed with exit code ${exitCode}`;
                if (stderr) {
                    // Common jj error patterns
                    if (stderr.includes('No such revset')) {
                        message = 'Invalid revision or branch reference';
                    } else if (stderr.includes('Concurrent modification')) {
                        message = 'Repository was modified by another process';
                    } else if (stderr.includes('Permission denied')) {
                        message = 'Permission denied accessing repository';
                    } else if (stderr.includes('not a valid Jujutsu repository')) {
                        message = 'Not a valid JuJutsu repository';
                    } else {
                        // Use first line of stderr as message if available
                        const firstLine = stderr.trim().split('\n')[0];
                        if (firstLine) {
                            message = firstLine;
                        }
                    }
                }
                
                throw new JjExecutionError(
                    message,
                    command,
                    args,
                    stderr,
                    exitCode,
                    err
                );
            }
        }
        
        // Unknown error type
        const message = err instanceof Error ? err.message : 'Unknown error executing jj command';
        throw new JjExecutionError(
            message,
            command,
            args,
            undefined,
            undefined,
            err
        );
    }
}

export class JjRepository {
    constructor(private readonly root: string) {}

    get rootPath(): string {
        return this.root;
    }

    /**
     * Check if jj is installed and this is a valid repository
     */
    async verify(): Promise<void> {
        try {
            await execJj(['root'], { cwd: this.root });
        } catch (err) {
            if (err instanceof JjExecutionError) {
                // Enhance error message for common cases
                if (err.message.includes('not a valid Jujutsu repository')) {
                    throw new JjExecutionError(
                        `The folder "${this.root}" is not a JuJutsu repository`,
                        err.command,
                        err.args,
                        err.stderr,
                        err.exitCode,
                        err
                    );
                }
            }
            throw err;
        }
    }

    /**
     * Return a summary of the current working copy status.
     * TODO: Use `jj status --relative --compact` once implemented.
     */
    async status(): Promise<StatusSummary> {
        try {
            const output = await this.diff();
            const summary = parseStatusOutput(output);

            const makeAbsolute = (f: FileStatus) => ({ ...f, path: path.join(this.root, f.path) });

            return {
                modified: summary.modified.map(makeAbsolute),
                added: summary.added.map(makeAbsolute),
                deleted: summary.deleted.map(makeAbsolute),
                moved: summary.moved.map(makeAbsolute),
            };
        } catch (err) {
            if (err instanceof JjExecutionError) {
                console.error(`Failed to get repository status: ${err.message}`);
                console.error(`Command: ${err.command} ${err.args.join(' ')}`);
                if (err.stderr) {
                    console.error(`stderr: ${err.stderr}`);
                }
            }
            throw err;
        }
    }

    /**
     * Commit staged changes with the given message.
     */
    async commit(message: string): Promise<void> {
        if (!message || !message.trim()) {
            throw new Error('Commit message cannot be empty');
        }
        
        try {
            await execJj(['commit', '-m', message], { cwd: this.root });
        } catch (err) {
            if (err instanceof JjExecutionError) {
                // Provide more specific error for common commit failures
                if (err.stderr?.includes('nothing to commit')) {
                    throw new Error('Nothing to commit - no changes in working copy');
                }
            }
            throw err;
        }
    }

    /**
     * Show the working copy diff.
     */
    async diff(): Promise<string> {
        return await execJj(['diff', '-s', '--no-pager'], { cwd: this.root });
    }

    /**
     * Show the commit history.
     */
    async log(): Promise<string[]> {
        try {
            const output = await execJj(
                ['log', '-T', 'description', '--no-pager', '--no-graph', '-r', '::@', '-n', '20'], 
                { cwd: this.root }
            );
            return output.split('\n').filter(l => l);
        } catch (err) {
            if (err instanceof JjExecutionError) {
                // Log history errors are often less critical
                console.warn(`Failed to retrieve commit history: ${err.message}`);
                return []; // Return empty history rather than failing completely
            }
            throw err;
        }
    }

    /**
     * List all branches.
     */
    async listBranches(): Promise<string[]> {
        try {
            const output = await execJj(['bookmark', 'list', '--no-pager'], { cwd: this.root });
            return output.split('\n').map(l => l.trim()).filter(l => l);
        } catch (err) {
            if (err instanceof JjExecutionError) {
                // Handle older jj versions that might use 'branch' instead of 'bookmark'
                if (err.stderr?.includes('unrecognized subcommand')) {
                    console.warn('Bookmark command not recognized, trying branch command');
                    try {
                        const output = await execJj(['branch', 'list', '--no-pager'], { cwd: this.root });
                        return output.split('\n').map(l => l.trim()).filter(l => l);
                    } catch (fallbackErr) {
                        console.error('Both bookmark and branch commands failed');
                        throw err; // Throw original error
                    }
                }
            }
            throw err;
        }
    }

    /**
     * Merge a branch into the current branch.
     */
    async mergeBranch(branch: string): Promise<void> {
        if (!branch || !branch.trim()) {
            throw new Error('Branch name cannot be empty');
        }
        
        try {
            await execJj(['new', branch, '@'], { cwd: this.root });
        } catch (err) {
            if (err instanceof JjExecutionError) {
                // Provide more specific error messages for merge failures
                if (err.stderr?.includes('No such revset')) {
                    throw new Error(`Branch "${branch}" does not exist`);
                } else if (err.stderr?.includes('Concurrent modification')) {
                    throw new Error('Repository was modified by another process. Please refresh and try again.');
                }
            }
            throw err;
        }
    }

    /**
     * Get the previous version of a file content
     * TODO: Implement with the correct jj command when provided
     * 
     * @param filePath Path to the file relative to repository root
     * @returns The content of the file in the previous revision
     */
    async getPreviousFileContent(filePath: string): Promise<string> {
        // TODO: Replace with actual jj command when provided
        // Possible implementations:
        // - jj cat -r @- <file>
        // - jj show @-:<file>
        // - jj file show -r @- <file>
        
        throw new Error('Getting previous file content not yet implemented. Please provide the jj command.');
        
        // Expected implementation:
        // const relativePath = path.relative(this.root, filePath);
        // return await execJj(['cat', '-r', '@-', relativePath], { cwd: this.root });
    }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

export function parseStatusOutput(output: string): StatusSummary {
    const summary: StatusSummary = { modified: [], added: [], deleted: [], moved: [] };

    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('jj ')) {
            continue; // skip header or empty line
        }

        const code = line[0];
        const rest = line.slice(1).trim();

        switch (code) {
            case 'A':
                summary.added.push({ path: rest, status: 'added' });
                break;
            case 'D':
                summary.deleted.push({ path: rest, status: 'deleted' });
                break;
            case 'M':
                summary.modified.push({ path: rest, status: 'modified' });
                break;
            case 'R':
                summary.moved.push({ path: extractNewPathFromRename(rest), status: 'moved' });
                break;
            default:
                // Unknown status code – ignore for now
                console.warn(`Unknown status code '${code}' in line: ${line}`);
                break;
        }
    }

    return summary;
}

function extractNewPathFromRename(rawPath: string): string {
    const start = rawPath.indexOf('{');
    const end = rawPath.indexOf('}');

    if (start === -1 || end === -1 || end < start) {
        // Simple rename format without braces – take text after arrow if present
        const arrow = rawPath.indexOf('=>');
        return arrow !== -1 ? rawPath.slice(arrow + 2).trim() : rawPath;
    }

    const prefix = rawPath.slice(0, start);
    const inner = rawPath.slice(start + 1, end);
    const suffix = rawPath.slice(end + 1);

    const arrowIdx = inner.indexOf('=>');
    if (arrowIdx === -1) {
        return rawPath; // unexpected format
    }

    const newPart = inner.slice(arrowIdx + 2).trim();
    return `${prefix}${newPart}${suffix}`;
}
