import type { StateValues } from '@organiser/sdk/protocol';

export interface Project {
  id: string;
  name: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

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
