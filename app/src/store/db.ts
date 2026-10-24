import Dexie, { type Table } from 'dexie';
import type { Comment, Project, Snapshot, Version } from './types';

export class OrganiserDB extends Dexie {
  projects!: Table<Project, string>;
  versions!: Table<Version, string>;
  comments!: Table<Comment, string>;
  snapshots!: Table<Snapshot, string>;

  constructor(name = 'organiser') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      versions: 'id, projectId, [projectId+number]',
      comments: 'id, versionId',
      snapshots: 'versionId',
    });
    this.version(2)
      .stores({ versions: 'id, projectId, [projectId+number], [projectId+externalId]' })
      .upgrade((tx) =>
        tx
          .table('versions')
          .toCollection()
          .modify((v: Version) => {
            v.source ??= 'manual';
          }),
      );
  }
}

export const db = new OrganiserDB();
