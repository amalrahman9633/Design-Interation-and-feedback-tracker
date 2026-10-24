import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { drain, enqueue, enqueueBackfill } from './build.ts';
import type { RepoConfig } from './config.ts';
import { siteDir } from './paths.ts';
import { readVersions, saveRepo, type RepoEntry } from './store.ts';

let root: string;
let repo: RepoEntry;
const config: RepoConfig = { name: 'proto', marker: '[v]', install: null, build: null, out: '.' };

const run = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: root, encoding: 'utf8' }).trim();

function commit(message: string, html: string) {
  fs.writeFileSync(path.join(root, 'index.html'), html);
  run('add', '-A');
  run('commit', '-q', '-m', message);
  return run('rev-parse', 'HEAD');
}

beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'organiser-build-'));
  process.env.ORGANISER_HOME = path.join(tmp, 'home');
  root = fs.realpathSync(fs.mkdirSync(path.join(tmp, 'repo'), { recursive: true })!);
  run('init', '-q', '-b', 'main');
  repo = { id: 'proto', name: 'proto', kind: 'local', path: root, marker: '[v]', addedAt: new Date().toISOString() };
  saveRepo(repo);
});

describe('enqueue + drain', () => {
  it('builds only marked commits, each from its own commit, without touching the working copy', async () => {
    const first = commit('First pass [v]', '<h1>one</h1>');
    commit('wip, not marked', '<h1>wip</h1>');
    expect(enqueue(repo, config)).toBeNull();

    const third = commit('Bolder title [v]', '<h1>three</h1>');
    fs.writeFileSync(path.join(root, 'scratch.txt'), 'uncommitted');
    expect(enqueue(repo, config)?.subject).toBe('Bolder title');
    expect(enqueue(repo, config)).toBeNull(); // already queued

    expect(enqueueBackfill(repo, config).map((v) => v.sha)).toEqual([first]);
    await drain(repo, config);

    const versions = readVersions(repo.id);
    expect(versions.map((v) => [v.sha, v.status])).toEqual([
      [first, 'ready'],
      [third, 'ready'],
    ]);
    expect(fs.readFileSync(path.join(siteDir(repo.id, first), 'index.html'), 'utf8')).toBe('<h1>one</h1>');
    expect(fs.readFileSync(path.join(siteDir(repo.id, third), 'index.html'), 'utf8')).toBe('<h1>three</h1>');
    expect(fs.existsSync(path.join(siteDir(repo.id, third), '.git'))).toBe(false);

    expect(run('status', '--porcelain')).toBe('?? scratch.txt');
    expect(run('worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('records failed builds with the error, and --force rebuilds them', async () => {
    commit('Broken [v]', '<h1>x</h1>');
    enqueue(repo, { ...config, build: 'echo boom && exit 3' });
    await drain(repo, { ...config, build: 'echo boom && exit 3' });
    const [failed] = readVersions(repo.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('exit 3');

    expect(enqueue(repo, config)).toBeNull();
    expect(enqueue(repo, config, 'HEAD', true)?.status).toBe('queued');
    await drain(repo, config);
    expect(readVersions(repo.id)[0].status).toBe('ready');
  });

  it('fails clearly when the output folder has no index.html', async () => {
    commit('Wrong out [v]', '<h1>x</h1>');
    enqueue(repo, config);
    await drain(repo, { ...config, out: 'dist' });
    expect(readVersions(repo.id)[0].error).toContain('No index.html in "dist"');
  });
});
