import * as assert from 'assert';
import * as path from 'path';
import { toResourceState } from '../adapters/resourceState';
import { FileStatus } from '../domain/JjRepository';

suite('toResourceState', () => {
    test('creates resource state from file status', () => {
        const root = '/tmp/workspace';
        const file: FileStatus = { path: 'foo.txt', status: 'modified' };
        const state = toResourceState(root, file);
        assert.strictEqual(state.resourceUri.fsPath, path.join(root, file.path));
        assert.strictEqual(state.decorations?.tooltip, file.status);
    });
});
