// File-based state: a registry of repos plus one meta.json per built commit.
// One file per commit means the hook (adding commits) and the builder
// (updating them) never rewrite the same file concurrently.

import fs from 'node:fs';
import path from 'node:path';
import { buildDir, configFile, repoBuilds, reposFile } from './paths.ts';

export type Provider = 'local' | 'vercel' | 'netlify';
export type BuildStatus = 'queued' | 'building' | 'ready' | 'failed';

export interface RepoEntry {
  id: string;
  name: string;
  kind: Provider;
  /** Local repos: absolute path of the working copy. */
  path?: string;
  /** Hosted sources. */
  remote?: { projectId?: string; teamId?: string; siteId?: string };
  marker: string;
  addedAt: string;
}

export interface VersionEntry {
  sha: string;
  shortSha: string;
  /** Commit subject with the marker removed. */
  subject: string;
  body: string;
  author: string;
  /** Commit date, ISO 8601. */
  date: string;
  branch: string;
  status: BuildStatus;
  provider: Provider;
  /** Hosted sources store their deploy URL; local builds get theirs from the server. */
  url?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface CompanionConfig {
  vercelToken?: string;
  netlifyToken?: string;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Write via a temp file + rename so readers never see a half-written file. */
export function writeJson(file: string, data: unknown, mode?: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

// --- Repos -------------------------------------------------------------------

export function readRepos(): RepoEntry[] {
  return Object.values(readJson<Record<string, RepoEntry>>(reposFile(), {}));
}

export function getRepo(id: string): RepoEntry | undefined {
  return readJson<Record<string, RepoEntry>>(reposFile(), {})[id];
}

export function saveRepo(entry: RepoEntry) {
  const all = readJson<Record<string, RepoEntry>>(reposFile(), {});
  all[entry.id] = entry;
  writeJson(reposFile(), all);
}

export function findRepoByPath(dir: string): RepoEntry | undefined {
  return readRepos().find((r) => r.path === dir);
}

// --- Versions ----------------------------------------------------------------

const metaFile = (repoId: string, sha: string) => path.join(buildDir(repoId, sha), 'meta.json');

export function readVersion(repoId: string, sha: string): VersionEntry | undefined {
  return readJson<VersionEntry | undefined>(metaFile(repoId, sha), undefined);
}

export function writeVersion(repoId: string, entry: VersionEntry) {
  writeJson(metaFile(repoId, entry.sha), entry);
}

export function updateVersion(repoId: string, sha: string, patch: Partial<VersionEntry>) {
  const current = readVersion(repoId, sha);
  if (current) writeVersion(repoId, { ...current, ...patch });
}

/** Oldest first, by commit date. */
export function readVersions(repoId: string): VersionEntry[] {
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(repoBuilds(repoId));
  } catch {
    return [];
  }
  return dirs
    .map((sha) => readVersion(repoId, sha))
    .filter((v): v is VersionEntry => !!v)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// --- Config (tokens) ---------------------------------------------------------

export const readConfig = () => readJson<CompanionConfig>(configFile(), {});

export function saveConfig(patch: CompanionConfig) {
  // Owner-only: this file holds API tokens.
  writeJson(configFile(), { ...readConfig(), ...patch }, 0o600);
  fs.chmodSync(configFile(), 0o600);
}
