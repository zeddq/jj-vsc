import * as assert from 'assert';
import * as path from 'path';
import proxyquire = require('proxyquire');
import sinon = require('sinon');

suite('JjRepository methods', () => {
  let execFileStub: sinon.SinonStub;
  let repoModule: typeof import('../domain/JjRepository');
  let JjRepository: typeof import('../domain/JjRepository').JjRepository;
  let JjExecutionError: typeof import('../domain/JjRepository').JjExecutionError;

  function loadModule() {
    execFileStub = sinon.stub();
    repoModule = proxyquire('../domain/JjRepository', {
      'node:child_process': { execFile: execFileStub }
    }) as typeof import('../domain/JjRepository');
    JjRepository = repoModule.JjRepository;
    JjExecutionError = repoModule.JjExecutionError;
  }

  setup(loadModule);

  test('status returns parsed diff', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      assert.strictEqual(args[0], 'diff');
      cb(null, 'D a.txt\nA b.txt\n', '');
    });
    const repo = new JjRepository('/repo');
    const status = await repo.status();
    assert.deepStrictEqual(status.deleted.map(f => f.path), [path.join('/repo', 'a.txt')]);
    assert.deepStrictEqual(status.added.map(f => f.path), [path.join('/repo', 'b.txt')]);
  });

  test('status throws on exec failure', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'boom';
      cb(err, '', 'boom');
    });
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.status.bind(repo), JjExecutionError);
  });

  test('commit succeeds', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      assert.strictEqual(args[0], 'commit');
      cb(null, '', '');
    });
    const repo = new JjRepository('/repo');
    await repo.commit('msg');
    assert.ok(execFileStub.calledOnce);
  });

  test('commit requires message', async () => {
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.commit(''), /Commit message cannot be empty/);
  });

  test('commit reports nothing to commit', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'nothing to commit';
      cb(err, '', 'nothing to commit');
    });
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.commit('msg'), /Nothing to commit/);
  });

  test('log returns history', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      cb(null, 'first\nsecond\n', '');
    });
    const repo = new JjRepository('/repo');
    const history = await repo.log();
    assert.deepStrictEqual(history, ['first', 'second']);
  });

  test('log swallows errors', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'bad';
      cb(err, '', 'bad');
    });
    const repo = new JjRepository('/repo');
    const history = await repo.log();
    assert.deepStrictEqual(history, []);
  });

  test('listBranches returns bookmark list', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      cb(null, 'main\nfeature\n', '');
    });
    const repo = new JjRepository('/repo');
    const branches = await repo.listBranches();
    assert.deepStrictEqual(branches, ['main', 'feature']);
  });

  test('listBranches falls back to branch list', async () => {
    execFileStub.onFirstCall().callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'unrecognized subcommand';
      cb(err, '', 'unrecognized subcommand');
    });
    execFileStub.onSecondCall().callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      cb(null, 'trunk\n', '');
    });
    const repo = new JjRepository('/repo');
    const branches = await repo.listBranches();
    assert.deepStrictEqual(branches, ['trunk']);
  });

  test('listBranches throws when both commands fail', async () => {
    execFileStub.onFirstCall().callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'unrecognized subcommand';
      cb(err, '', 'unrecognized subcommand');
    });
    execFileStub.onSecondCall().callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 2;
      err.stderr = 'boom';
      cb(err, '', 'boom');
    });
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.listBranches.bind(repo), JjExecutionError);
  });

  test('mergeBranch succeeds', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      assert.strictEqual(args[0], 'new');
      cb(null, '', '');
    });
    const repo = new JjRepository('/repo');
    await repo.mergeBranch('feature');
    assert.ok(execFileStub.calledOnce);
  });

  test('mergeBranch requires name', async () => {
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.mergeBranch(''), /Branch name cannot be empty/);
  });

  test('mergeBranch handles missing branch', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'No such revset';
      cb(err, '', 'No such revset');
    });
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.mergeBranch('other'), /does not exist/);
  });

  test('mergeBranch handles concurrent modification', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'Concurrent modification';
      cb(err, '', 'Concurrent modification');
    });
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.mergeBranch('dev'), /another process/);
  });

  test('mergeBranch rethrows other errors', async () => {
    execFileStub.callsFake((cmd: string, args: string[], opts: unknown, cb: (err: any, stdout: string, stderr: string) => void) => {
      const err: any = new Error('fail');
      err.code = 1;
      err.stderr = 'boom';
      cb(err, '', 'boom');
    });
    const repo = new JjRepository('/repo');
    await assert.rejects(repo.mergeBranch('dev'), JjExecutionError);
  });
});
