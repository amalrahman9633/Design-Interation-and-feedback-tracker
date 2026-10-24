// Hosted sources: Vercel and Netlify already build every push at its own
// immutable URL. We poll their deploy lists and keep the marked commits.

import { describeCommit, hasMarker } from './config.ts';
import { readConfig, readVersion, writeVersion, type BuildStatus, type RepoEntry, type VersionEntry } from './store.ts';

interface VercelDeployment {
  uid: string;
  url: string;
  created: number;
  state?: string;
  readyState?: string;
  meta?: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitAuthorName?: string;
    githubCommitRef?: string;
    gitlabCommitSha?: string;
    gitlabCommitMessage?: string;
    gitlabCommitAuthorName?: string;
    gitlabCommitRef?: string;
  };
}

interface NetlifyDeploy {
  id: string;
  state: string;
  title?: string | null;
  commit_ref?: string | null;
  branch?: string | null;
  created_at: string;
  committer?: string | null;
  links?: { permalink?: string };
  deploy_ssl_url?: string;
}

function vercelStatus(state = ''): BuildStatus {
  if (state === 'READY') return 'ready';
  if (state === 'ERROR' || state === 'CANCELED') return 'failed';
  if (state === 'QUEUED' || state === 'INITIALIZING') return 'queued';
  return 'building';
}

function netlifyStatus(state: string): BuildStatus {
  if (state === 'ready') return 'ready';
  if (state === 'error' || state === 'rejected') return 'failed';
  if (state === 'new' || state === 'enqueued' || state === 'pending') return 'queued';
  return 'building';
}

/** Newest deployment per commit wins (redeploys of the same commit). */
function newestPerCommit(entries: VersionEntry[]): VersionEntry[] {
  const bySha = new Map<string, VersionEntry>();
  for (const e of entries) {
    const prev = bySha.get(e.sha);
    if (!prev || (prev.startedAt ?? '') < (e.startedAt ?? '')) bySha.set(e.sha, e);
  }
  return [...bySha.values()];
}

export function fromVercel(deployments: VercelDeployment[], marker: string): VersionEntry[] {
  return newestPerCommit(
    deployments.flatMap((d) => {
      const m = d.meta ?? {};
      const sha = m.githubCommitSha ?? m.gitlabCommitSha;
      const message = m.githubCommitMessage ?? m.gitlabCommitMessage ?? '';
      if (!sha || !hasMarker(message, marker)) return [];
      const { subject, body } = describeCommit(message, marker);
      const created = new Date(d.created).toISOString();
      return [
        {
          sha,
          shortSha: sha.slice(0, 7),
          subject,
          body,
          author: m.githubCommitAuthorName ?? m.gitlabCommitAuthorName ?? '',
          date: created,
          branch: m.githubCommitRef ?? m.gitlabCommitRef ?? '',
          status: vercelStatus(d.readyState ?? d.state),
          provider: 'vercel' as const,
          url: `https://${d.url}`,
          startedAt: created,
        },
      ];
    }),
  );
}

export function fromNetlify(deploys: NetlifyDeploy[], marker: string): VersionEntry[] {
  return newestPerCommit(
    deploys.flatMap((d) => {
      const message = d.title ?? '';
      if (!d.commit_ref || !hasMarker(message, marker)) return [];
      const { subject, body } = describeCommit(message, marker);
      return [
        {
          sha: d.commit_ref,
          shortSha: d.commit_ref.slice(0, 7),
          subject,
          body,
          author: d.committer ?? '',
          date: d.created_at,
          branch: d.branch ?? '',
          status: netlifyStatus(d.state),
          provider: 'netlify' as const,
          // The permalink is pinned to this deploy; deploy_ssl_url can move.
          url: d.links?.permalink ?? d.deploy_ssl_url,
          startedAt: d.created_at,
        },
      ];
    }),
  );
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}

/** Fetches the latest deploys for a hosted repo and stores marked ones. Returns how many changed. */
export async function syncRemote(repo: RepoEntry): Promise<number> {
  const config = readConfig();
  let entries: VersionEntry[];
  if (repo.kind === 'vercel') {
    if (!config.vercelToken) throw new Error('No Vercel token. Run `organiser connect vercel --token …`.');
    const params = new URLSearchParams({ projectId: repo.remote!.projectId!, limit: '100' });
    if (repo.remote?.teamId) params.set('teamId', repo.remote.teamId);
    const data = await getJson<{ deployments: VercelDeployment[] }>(`https://api.vercel.com/v6/deployments?${params}`, config.vercelToken);
    entries = fromVercel(data.deployments, repo.marker);
  } else if (repo.kind === 'netlify') {
    if (!config.netlifyToken) throw new Error('No Netlify token. Run `organiser connect netlify --token …`.');
    const data = await getJson<NetlifyDeploy[]>(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(repo.remote!.siteId!)}/deploys?per_page=100`,
      config.netlifyToken,
    );
    entries = fromNetlify(data, repo.marker);
  } else {
    return 0;
  }

  let changed = 0;
  for (const entry of entries) {
    const prev = readVersion(repo.id, entry.sha);
    if (prev && prev.status === entry.status && prev.url === entry.url) continue;
    writeVersion(repo.id, entry);
    changed++;
  }
  return changed;
}
