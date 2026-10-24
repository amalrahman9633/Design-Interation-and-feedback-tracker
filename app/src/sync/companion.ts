// Talks to the local `organiser` companion (cli/), which builds marked git
// commits and reports them. Projects connected to it stay in sync live.

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useSyncExternalStore } from 'react';
import { repo } from '../store/repo';
import type { CompanionVersion, Project, ProjectSource } from '../store/types';

export const DEFAULT_ENDPOINT = 'http://localhost:5199';

export interface CompanionRepo {
  id: string;
  name: string;
  kind: ProjectSource['provider'];
  path?: string;
  marker: string;
  versions: number;
  latest: string | null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Companion responded ${res.status}`);
  return (await res.json()) as T;
}

export const fetchRepos = (endpoint: string) => getJson<CompanionRepo[]>(`${endpoint}/api/repos`);

export const fetchVersions = (endpoint: string, repoId: string) =>
  getJson<CompanionVersion[]>(`${endpoint}/api/repos/${encodeURIComponent(repoId)}/versions`);

export async function requestBackfill(endpoint: string, repoId: string) {
  await fetch(`${endpoint}/api/repos/${encodeURIComponent(repoId)}/backfill`, { method: 'POST' });
}

export async function fetchLog(source: ProjectSource, sha: string): Promise<string> {
  const res = await fetch(`${source.endpoint}/api/repos/${encodeURIComponent(source.repo)}/versions/${sha}/log`);
  // Strip terminal colour codes some build tools print anyway.
  return res.ok ? (await res.text()).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') : '';
}

export async function syncProject(project: Project) {
  if (!project.source) return;
  const versions = await fetchVersions(project.source.endpoint, project.source.repo);
  await repo.upsertSyncedVersions(project.id, versions);
}

// --- Online status (per endpoint) -------------------------------------------

type Status = 'online' | 'offline' | 'unknown';
const statuses = new Map<string, Status>();
const listeners = new Set<() => void>();

function setStatus(endpoint: string, status: Status) {
  if (statuses.get(endpoint) === status) return;
  statuses.set(endpoint, status);
  for (const fn of listeners) fn();
}

export function useCompanionStatus(endpoint: string | undefined): Status {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (endpoint ? (statuses.get(endpoint) ?? 'unknown') : 'unknown'),
  );
}

// --- Live sync ---------------------------------------------------------------

/**
 * Mounted once at the app root: keeps one event stream per companion open and
 * pulls versions whenever a connected repo changes (or the companion restarts).
 */
export function CompanionSync() {
  const projects = useLiveQuery(async () => (await repo.listProjects()).filter((p) => p.source)) ?? [];
  const key = projects.map((p) => `${p.id}|${p.source!.endpoint}|${p.source!.repo}`).join(',');

  useEffect(() => {
    const byEndpoint = new Map<string, Project[]>();
    for (const p of projects) byEndpoint.set(p.source!.endpoint, [...(byEndpoint.get(p.source!.endpoint) ?? []), p]);

    const streams = [...byEndpoint].map(([endpoint, list]) => {
      const syncAll = (repoId?: string) =>
        Promise.all(list.filter((p) => !repoId || p.source!.repo === repoId).map(syncProject)).catch(() =>
          setStatus(endpoint, 'offline'),
        );
      const events = new EventSource(`${endpoint}/api/events`);
      events.onopen = () => {
        setStatus(endpoint, 'online');
        void syncAll();
      };
      events.onerror = () => setStatus(endpoint, 'offline');
      events.addEventListener('change', (e) => {
        try {
          void syncAll(JSON.parse((e as MessageEvent).data).repo);
        } catch {
          void syncAll();
        }
      });
      return events;
    });
    return () => streams.forEach((s) => s.close());
    // `key` captures everything about `projects` that matters here.
  }, [key]);

  return null;
}
