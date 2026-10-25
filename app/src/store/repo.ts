// All reads and writes go through this module so the IndexedDB backend can be
// swapped for a hosted one (e.g. Supabase) later without touching the UI.

import { db as defaultDb, type OrganiserDB } from './db';
import type { Comment, CommentAnchor, CompanionVersion, ExportFile, Project, ProjectSource, Version } from './types';

const uid = () => crypto.randomUUID();
// Bounds for ranges over the [projectId+number] compound index.
const MIN = -Infinity;
const MAX = Infinity;

export function createRepo(db: OrganiserDB) {
  const touchProject = (projectId: string) => db.projects.update(projectId, { updatedAt: Date.now() });

  const repo = {
    // --- Projects --------------------------------------------------------
    listProjects: () => db.projects.orderBy('updatedAt').reverse().toArray(),
    getProject: (id: string) => db.projects.get(id),

    async createProject(input: { name: string; url: string; note?: string; commit?: string }) {
      const now = Date.now();
      const project: Project = { id: uid(), name: input.name.trim(), archived: false, createdAt: now, updatedAt: now };
      await db.projects.add(project);
      const version = await repo.createVersion({ projectId: project.id, url: input.url, note: input.note, commit: input.commit });
      return { project, version };
    },

    /** A project whose versions come from the companion instead of being saved by hand. */
    async createSyncedProject(input: { name: string; source: ProjectSource }) {
      const now = Date.now();
      const project: Project = { id: uid(), name: input.name.trim(), archived: false, source: input.source, createdAt: now, updatedAt: now };
      await db.projects.add(project);
      return project;
    },

    findProjectBySource: async (endpoint: string, repoId: string) =>
      (await db.projects.toArray()).find((p) => p.source?.endpoint === endpoint && p.source.repo === repoId),

    updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'archived'>>) =>
      db.projects.update(id, { ...patch, updatedAt: Date.now() }),

    deleteProject: (id: string) =>
      db.transaction('rw', [db.projects, db.versions, db.comments, db.snapshots], async () => {
        const versions = await db.versions.where('projectId').equals(id).primaryKeys();
        await db.comments.where('versionId').anyOf(versions).delete();
        await db.snapshots.bulkDelete(versions);
        await db.versions.bulkDelete(versions);
        await db.projects.delete(id);
      }),

    // --- Versions --------------------------------------------------------
    /** Newest first. */
    listVersions: (projectId: string) =>
      db.versions
        .where('[projectId+number]')
        .between([projectId, MIN], [projectId, MAX])
        .reverse()
        .toArray(),
    getVersion: (id: string) => db.versions.get(id),

    async createVersion(input: { projectId: string; url: string; note?: string; name?: string; commit?: string }) {
      return db.transaction('rw', [db.projects, db.versions], async () => {
        const last = await db.versions
          .where('[projectId+number]')
          .between([input.projectId, MIN], [input.projectId, MAX])
          .last();
        const number = (last?.number ?? 0) + 1;
        const version: Version = {
          id: uid(),
          projectId: input.projectId,
          number,
          name: input.name?.trim() || `v${number}`,
          note: input.note?.trim() ?? '',
          url: input.url.trim(),
          commit: input.commit?.trim() || undefined,
          hasSnapshot: false,
          createdAt: Date.now(),
          source: 'manual',
        };
        await db.versions.add(version);
        await touchProject(input.projectId);
        return version;
      });
    },

    /**
     * Adds new commits from the companion and refreshes build status on known
     * ones (by sha). Names and notes you edited are kept. Versions are then
     * numbered by commit date, so backfilled older commits slot in before newer ones.
     */
    async upsertSyncedVersions(projectId: string, entries: CompanionVersion[]) {
      return db.transaction('rw', [db.projects, db.versions], async () => {
        let added = 0;
        let updated = 0;
        for (const e of entries) {
          const existing = await db.versions.where('[projectId+externalId]').equals([projectId, e.sha]).first();
          if (existing) {
            if (existing.status !== e.status || existing.url !== e.url || existing.error !== e.error) {
              await db.versions.update(existing.id, { status: e.status, url: e.url, error: e.error });
              updated++;
            }
            continue;
          }
          await db.versions.add({
            id: uid(),
            projectId,
            number: 0,
            name: e.subject,
            note: e.body,
            url: e.url,
            commit: e.shortSha,
            hasSnapshot: false,
            createdAt: Date.parse(e.date) || Date.now(),
            source: e.provider,
            externalId: e.sha,
            status: e.status,
            error: e.error,
            author: e.author || undefined,
            branch: e.branch || undefined,
          });
          added++;
        }
        if (added) {
          const all = await db.versions.where('projectId').equals(projectId).toArray();
          all.sort((a, b) => a.createdAt - b.createdAt);
          await Promise.all(all.map((v, i) => (v.number === i + 1 ? null : db.versions.update(v.id, { number: i + 1 }))));
          await touchProject(projectId);
        }
        return { added, updated };
      });
    },

    updateVersion: (id: string, patch: Partial<Pick<Version, 'name' | 'note' | 'url' | 'commit'>>) =>
      db.versions.update(id, patch),

    deleteVersion: (id: string) =>
      db.transaction('rw', [db.versions, db.comments, db.snapshots], async () => {
        await db.comments.where('versionId').equals(id).delete();
        await db.snapshots.delete(id);
        await db.versions.delete(id);
      }),

    // --- Snapshots -------------------------------------------------------
    getSnapshot: (versionId: string) => db.snapshots.get(versionId),

    saveSnapshot: (versionId: string, dataUrl: string) =>
      db.transaction('rw', [db.versions, db.snapshots], async () => {
        await db.snapshots.put({ versionId, dataUrl, createdAt: Date.now() });
        await db.versions.update(versionId, { hasSnapshot: true });
      }),

    // --- Comments --------------------------------------------------------
    listComments: (versionId: string) => db.comments.where('versionId').equals(versionId).sortBy('number'),
    countComments: async (versionIds: string[]) => {
      const all = await db.comments.where('versionId').anyOf(versionIds).toArray();
      const counts: Record<string, { open: number; total: number }> = {};
      for (const c of all) {
        const entry = (counts[c.versionId] ??= { open: 0, total: 0 });
        entry.total++;
        if (!c.resolved) entry.open++;
      }
      return counts;
    },

    async addComment(versionId: string, anchor: CommentAnchor, body: string) {
      return db.transaction('rw', [db.comments], async () => {
        const existing = await db.comments.where('versionId').equals(versionId).toArray();
        const comment: Comment = {
          id: uid(),
          versionId,
          number: existing.reduce((max, c) => Math.max(max, c.number), 0) + 1,
          anchor,
          body: body.trim(),
          resolved: false,
          replies: [],
          createdAt: Date.now(),
        };
        await db.comments.add(comment);
        return comment;
      });
    },

    updateComment: (id: string, patch: Partial<Pick<Comment, 'body' | 'resolved'>>) => db.comments.update(id, patch),

    async addReply(commentId: string, body: string) {
      const comment = await db.comments.get(commentId);
      if (!comment) return;
      const replies = [...comment.replies, { id: uid(), body: body.trim(), createdAt: Date.now() }];
      await db.comments.update(commentId, { replies });
    },

    async deleteReply(commentId: string, replyId: string) {
      const comment = await db.comments.get(commentId);
      if (!comment) return;
      await db.comments.update(commentId, { replies: comment.replies.filter((r) => r.id !== replyId) });
    },

    deleteComment: (id: string) => db.comments.delete(id),

    // --- Import / export -------------------------------------------------
    async exportAll(): Promise<ExportFile> {
      const [projects, versions, comments, snapshots] = await Promise.all([
        db.projects.toArray(),
        db.versions.toArray(),
        db.comments.toArray(),
        db.snapshots.toArray(),
      ]);
      return { app: 'organiser', schema: 1, exportedAt: Date.now(), projects, versions, comments, snapshots };
    },

    /** Merges by id: existing records with the same id are overwritten. */
    async importAll(data: unknown) {
      const file = data as Partial<ExportFile>;
      if (file?.app !== 'organiser' || file.schema !== 1) throw new Error('Not an Organiser export file.');
      await db.transaction('rw', [db.projects, db.versions, db.comments, db.snapshots], async () => {
        await db.projects.bulkPut(file.projects ?? []);
        await db.versions.bulkPut(file.versions ?? []);
        await db.comments.bulkPut(file.comments ?? []);
        await db.snapshots.bulkPut(file.snapshots ?? []);
      });
      return { projects: file.projects?.length ?? 0, versions: file.versions?.length ?? 0 };
    },
  };
  return repo;
}

export type Repo = ReturnType<typeof createRepo>;
export const repo = createRepo(defaultDb);
