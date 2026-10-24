import { describe, expect, it } from 'vitest';
import { fromNetlify, fromVercel } from './remote.ts';

describe('fromVercel', () => {
  it('keeps marked commits, newest deployment per commit, with immutable URLs', () => {
    const entries = fromVercel(
      [
        { uid: 'd1', url: 'proto-abc.vercel.app', created: 1000, readyState: 'ERROR', meta: { githubCommitSha: 'aaaaaaa111', githubCommitMessage: 'Header [v]', githubCommitRef: 'main' } },
        { uid: 'd2', url: 'proto-def.vercel.app', created: 2000, readyState: 'READY', meta: { githubCommitSha: 'aaaaaaa111', githubCommitMessage: 'Header [v]', githubCommitRef: 'main' } },
        { uid: 'd3', url: 'proto-ghi.vercel.app', created: 3000, readyState: 'BUILDING', meta: { githubCommitSha: 'bbbbbbb222', githubCommitMessage: 'wip' } },
        { uid: 'd4', url: 'proto-jkl.vercel.app', created: 4000, readyState: 'BUILDING', meta: {} },
      ],
      '[v]',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sha: 'aaaaaaa111', subject: 'Header', status: 'ready', url: 'https://proto-def.vercel.app', provider: 'vercel' });
  });
});

describe('fromNetlify', () => {
  it('uses the per-deploy permalink and maps states', () => {
    const entries = fromNetlify(
      [
        { id: 'n1', state: 'building', title: 'Softer colours [v]', commit_ref: 'ccccccc333', branch: 'main', created_at: '2026-10-24T10:00:00Z', links: { permalink: 'https://n1--proto.netlify.app' } },
        { id: 'n2', state: 'ready', title: 'Not marked', commit_ref: 'ddddddd444', created_at: '2026-10-24T11:00:00Z' },
      ],
      '[v]',
    );
    expect(entries).toEqual([
      expect.objectContaining({ sha: 'ccccccc333', status: 'building', url: 'https://n1--proto.netlify.app', provider: 'netlify' }),
    ]);
  });
});
