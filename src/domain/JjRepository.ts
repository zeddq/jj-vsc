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

const execFileAsync = promisify(execFile);

async function execJj(args: string[], { cwd }: { cwd: string }): Promise<string> {
    try {
        const { stdout, stderr } = await execFileAsync('jj', args, { cwd });
        if (stderr.trim() !== '') {
            throw new Error(stderr.trim());
        }
        return stdout.trim();
    } catch (err) {
        console.error('Error executing jj:', err);
        throw new Error('Failed to execute jj');
    }
}

export class JjRepository {
    constructor(private readonly root: string) {}

    get rootPath(): string {
        return this.root;
    }

    /**
     * Return a summary of the current working copy status.
     * TODO: Use `jj status --relative --compact` once implemented.
     */
    async status(): Promise<StatusSummary> {
        const output = await this.diff();
        const summary = parseStatusOutput(output);

        const makeAbsolute = (f: FileStatus) => ({ ...f, path: path.join(this.root, f.path) });

        return {
            modified: summary.modified.map(makeAbsolute),
            added: summary.added.map(makeAbsolute),
            deleted: summary.deleted.map(makeAbsolute),
            moved: summary.moved.map(makeAbsolute),
        };
    }

    /**
     * Commit staged changes with the given message.
     */
    async commit(message: string): Promise<void> {
        await execJj(['commit', '-m', message], { cwd: this.root });
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
        const output = await execJj(['log', '-T', 'description', '--no-pager', '--no-graph', '-r', '::@', '-n', '20'], { cwd: this.root });
        return output.split('\n').filter(l => l);
    }

    /**
     * List all branches.
     */
    async listBranches(): Promise<string[]> {
        const output = await execJj(['bookmark', 'list', '--no-pager'], { cwd: this.root });
        return output.split('\n').map(l => l.trim()).filter(l => l);
    }

    /**
     * Merge a branch into the current branch.
     */
    async mergeBranch(branch: string): Promise<void> {
        await execJj(['new', branch, '@'], { cwd: this.root });
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