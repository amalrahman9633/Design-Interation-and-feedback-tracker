import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { OrganiserDB } from './db';
import { createRepo, type Repo } from './repo';
import type { CompanionVersion } from './types';

let repo: Repo;
let n = 0;

beforeEach(() => {
  repo = createRepo(new OrganiserDB(`test-${n++}`));
});

describe('repo', () => {
  it('creates a project with v1 and numbers later versions newest-first', async () => {
    const { project, version } = await repo.createProject({ name: 'Payment prototype', url: 'http://localhost:3000' });
    expect(version).toMatchObject({ number: 1, name: 'v1' });
    await repo.createVersion({ projectId: project.id, url: 'http://localhost:3000', note: 'New CTA' });
    await repo.createVersion({ projectId: project.id, url: 'http://localhost:3000', name: 'Bold header' });
    const versions = await repo.listVersions(project.id);
    expect(versions.map((v) => v.name)).toEqual(['Bold header', 'v2', 'v1']);
  });

  it('numbers comments per version and counts open ones', async () => {
    const { version } = await repo.createProject({ name: 'Note', url: 'https://x.vercel.app' });
    const anchor = { mode: 'point' as const, x: 10, y: 20 };
    const a = await repo.addComment(version.id, anchor, 'Too much padding');
    const b = await repo.addComment(version.id, anchor, 'Love this');
    expect([a.number, b.number]).toEqual([1, 2]);
    await repo.updateComment(b.id, { resolved: true });
    await repo.addReply(a.id, 'Agreed');
    await repo.addReply(a.id, 'Typo, ignore');
    const typo = (await repo.listComments(version.id))[0].replies[1];
    await repo.deleteReply(a.id, typo.id);
    expect(await repo.countComments([version.id])).toEqual({ [version.id]: { open: 1, total: 2 } });
    expect((await repo.listComments(version.id))[0].replies).toHaveLength(1);
  });

  it('deletes a project with its versions, comments and snapshots', async () => {
    const { project, version } = await repo.createProject({ name: 'Home', url: 'http://localhost:5174' });
    await repo.addComment(version.id, { mode: 'point', x: 0, y: 0 }, 'hi');
    await repo.saveSnapshot(version.id, 'data:image/jpeg;base64,AAAA');
    expect((await repo.getVersion(version.id))?.hasSnapshot).toBe(true);
    await repo.deleteProject(project.id);
    const dump = await repo.exportAll();
    expect([dump.projects, dump.versions, dump.comments, dump.snapshots].map((t) => t.length)).toEqual([0, 0, 0, 0]);
  });

  it('round-trips through export/import', async () => {
    const { version } = await repo.createProject({ name: 'Round trip', url: 'http://localhost:1' });
    await repo.addComment(version.id, { mode: 'point', x: 1, y: 2 }, 'keep me');
    const dump = JSON.parse(JSON.stringify(await repo.exportAll()));
    const fresh = createRepo(new OrganiserDB(`test-${n++}`));
    expect(await fresh.importAll(dump)).toEqual({ projects: 1, versions: 1 });
    expect((await fresh.listComments(version.id))[0].body).toBe('keep me');
    await expect(fresh.importAll({ hello: 'world' })).rejects.toThrow();
  });
});

const commitEntry = (sha: string, date: string, patch: Partial<CompanionVersion> = {}): CompanionVersion => ({
  sha,
  shortSha: sha.slice(0, 7),
  subject: `Commit ${sha.slice(0, 4)}`,
  body: '',
  author: 'Amal',
  date,
  branch: 'main',
  status: 'ready',
  provider: 'local',
  url: `http://${sha.slice(0, 7)}.proto.localhost:5199/`,
  ...patch,
});

describe('synced versions', () => {
  it('adds new commits, refreshes status, keeps edits and numbers by commit date', async () => {
    const project = await repo.createSyncedProject({
      name: 'Proto',
      source: { kind: 'git', endpoint: 'http://localhost:5199', repo: 'proto', provider: 'local' },
    });
    const newer = commitEntry('bbbbbbbbbb', '2026-10-24T12:00:00Z', { status: 'building' });
    expect(await repo.upsertSyncedVersions(project.id, [newer])).toEqual({ added: 1, updated: 0 });

    const [first] = await repo.listVersions(project.id);
    await repo.updateVersion(first.id, { name: 'Renamed by me' });

    // Backfill brings an older commit; the build of the newer one finishes.
    const older = commitEntry('aaaaaaaaaa', '2026-10-20T09:00:00Z');
    expect(await repo.upsertSyncedVersions(project.id, [{ ...newer, status: 'ready' }, older])).toEqual({ added: 1, updated: 1 });
    expect(await repo.upsertSyncedVersions(project.id, [newer, older].map((e) => ({ ...e, status: 'ready' as const })))).toEqual({
      added: 0,
      updated: 0,
    });

    const versions = await repo.listVersions(project.id);
    expect(versions.map((v) => [v.number, v.name, v.status, v.source])).toEqual([
      [2, 'Renamed by me', 'ready', 'local'],
      [1, 'Commit aaaa', 'ready', 'local'],
    ]);
    expect(await repo.findProjectBySource('http://localhost:5199', 'proto')).toMatchObject({ id: project.id });
  });

  it('upgrades a v1 database, marking existing versions as manual', async () => {
    const name = `upgrade-${n++}`;
    const old = new Dexie(name);
    old.version(1).stores({ projects: 'id, updatedAt', versions: 'id, projectId, [projectId+number]', comments: 'id, versionId', snapshots: 'versionId' });
    await old.table('versions').add({ id: 'v1', projectId: 'p1', number: 1, name: 'v1', note: '', url: 'http://localhost:3000', hasSnapshot: false, createdAt: 1 });
    old.close();

    const upgraded = createRepo(new OrganiserDB(name));
    expect(await upgraded.getVersion('v1')).toMatchObject({ source: 'manual' });
  });
});
