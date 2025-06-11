import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export interface FileStatus {
    path: string;
    status: 'modified' | 'added' | 'deleted';
}

export interface StatusSummary {
    modified: FileStatus[];
    added: FileStatus[];
    deleted: FileStatus[];
}

const execFileAsync = promisify(execFile);

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
        // TODO: Integrate with the real `jj` CLI.
        return {
            modified: [],
            added: [],
            deleted: [],
        };
    }

    /**
     * Commit staged changes with the given message.
     * TODO: Update to call `jj commit`.
     */
    async commit(message: string): Promise<void> {
        // Stub implementation – replace with real CLI call
        await execFileAsync('echo', [`JJ commit stub: ${message}`], { cwd: this.root });
    }
} 