import type { StateValues } from '@organiser/sdk/protocol';

/** Where a project's versions come from when they aren't saved by hand. */
export interface ProjectSource {
  kind: 'git';
  /** The local companion, e.g. http://localhost:5199. */
  endpoint: string;
  /** Repo id in the companion. */
  repo: string;
  /** Which builder the companion uses for this repo. */
  provider: 'local' | 'vercel' | 'netlify';
  /** Commit-message marker that turns a commit into a version. */
  marker?: string;
}

export interface Project {
  id: string;
  name: string;
  archived: boolean;
  source?: ProjectSource;
  createdAt: number;
  updatedAt: number;
}

export type VersionSource = 'manual' | 'local' | 'vercel' | 'netlify';
export type BuildStatus = 'queued' | 'building' | 'ready' | 'failed';

export interface Version {
  id: string;
  projectId: string;
  /** 1-based, increasing per project. */
  number: number;
  name: string;
  /** "What changed" in this iteration. */
  note: string;
  url: string;
  commit?: string;
  hasSnapshot: boolean;
  createdAt: number;
  /** `manual` for saved-by-hand versions; otherwise the builder that produced it. */
  source?: VersionSource;
  /** Full commit sha for synced versions (dedupe key). */
  externalId?: string;
  status?: BuildStatus;
  error?: string;
  author?: string;
  branch?: string;
}

/** A version as the companion's API reports it (GET /api/repos/:id/versions). */
export interface CompanionVersion {
  sha: string;
  shortSha: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  branch: string;
  status: BuildStatus;
  provider: 'local' | 'vercel' | 'netlify';
  url: string;
  error?: string;
}

export interface CommentAnchor {
  /** `element` when the prototype runs the SDK, `point` otherwise. */
  mode: 'element' | 'point';
  selector?: string;
  offsetX?: number;
  offsetY?: number;
  route?: string;
  /** Point mode: position as a % of the visible frame. */
  x: number;
  y: number;
  variant?: string | null;
  stateValues?: StateValues;
}

export interface Reply {
  id: string;
  body: string;
  createdAt: number;
}

export interface Comment {
  id: string;
  versionId: string;
  number: number;
  anchor: CommentAnchor;
  body: string;
  resolved: boolean;
  replies: Reply[];
  createdAt: number;
}

export interface Snapshot {
  versionId: string;
  dataUrl: string;
  createdAt: number;
}

export interface ExportFile {
  app: 'organiser';
  schema: 1;
  exportedAt: number;
  projects: Project[];
  versions: Version[];
  comments: Comment[];
  snapshots: Snapshot[];
}
