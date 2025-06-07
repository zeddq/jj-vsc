import * as assert from 'assert';
import { parseStatusOutput, StatusSummary } from '../domain/JjRepository';

function emptySummary(): StatusSummary {
    return { added: [], modified: [], deleted: [], moved: [] };
}

suite('parseStatusOutput', () => {
    test('categorizes diff output correctly', () => {
        const output = `jj diff -s --no-pager\nD README.md\nM package.json\nA src/adapters/resourceGroup.ts\nR src/adapters/{toResourceState.ts => resourceState.ts}`;

        const result = parseStatusOutput(output);
        assert.deepStrictEqual(result.deleted.map(f => f.path), ['README.md']);
        assert.deepStrictEqual(result.modified.map(f => f.path), ['package.json']);
        assert.deepStrictEqual(result.added.map(f => f.path), ['src/adapters/resourceGroup.ts']);
        assert.deepStrictEqual(result.moved.map(f => f.path), ['src/adapters/resourceState.ts']);
    });

    test('ignores unknown status codes', () => {
        const output = `X unknown.txt\nY another.txt`;
        const result = parseStatusOutput(output);
        assert.deepStrictEqual(result, emptySummary());
    });

    test('empty output returns empty summary', () => {
        assert.deepStrictEqual(parseStatusOutput(''), emptySummary());
    });

    test('fuzzy: random inputs never throw', () => {
        const codes = ['A', 'D', 'M', 'R', 'X', 'Y', 'Z'];
        for (let i = 0; i < 500; i++) {
            const code = codes[Math.floor(Math.random() * codes.length)];
            const path = Math.random().toString(36).substring(2) + '.txt';
            const line = `${code} ${path}`;
            try {
                parseStatusOutput(line);
            } catch (err) {
                assert.fail(`parseStatusOutput threw on line: ${line}`);
            }
        }
    });
}); 