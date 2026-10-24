import { beforeEach, describe, expect, it } from 'vitest';
import { OrganiserDB } from './db';
import { createRepo, type Repo } from './repo';

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
