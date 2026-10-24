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
  }
}

export const db = new OrganiserDB();
