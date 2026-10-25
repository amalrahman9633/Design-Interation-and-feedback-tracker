// Local companion server.
//   <sha7>.<repo>.localhost:5199/…  → the static build of that commit
//   localhost:5199/api/…            → JSON API + server-sent events for the app
// Binds to loopback only.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUrl, buildsRoot, logFile, repoBuilds, siteDir } from './paths.ts';
import { syncRemote } from './remote.ts';
import { getRepo, readConfig, readRepos, readVersions, type VersionEntry } from './store.ts';

export const API_VERSION = 1;
const REMOTE_POLL_MS = 30_000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const BUILD_HOST = /^([0-9a-f]{7,40})\.([a-z0-9-]+)\.localhost$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * The app on localhost, plus origins added with `organiser allow` (e.g. the
 * deployed app). Anything else could read repo paths and build logs.
 */
export function isAllowedOrigin(origin: string): boolean {
  return LOCAL_ORIGIN.test(origin) || (readConfig().allowedOrigins ?? []).includes(origin);
}

/** Version entries as the app sees them, with local URLs filled in. Newest first. */
export function apiVersions(repoId: string): VersionEntry[] {
  return readVersions(repoId)
    .map((v) => (v.provider === 'local' ? { ...v, url: buildUrl(repoId, v.sha) } : v))
    .reverse();
}

function findBuild(repoId: string, shaPrefix: string): string | null {
  try {
    const sha = fs.readdirSync(repoBuilds(repoId)).find((d) => d.startsWith(shaPrefix));
    return sha ? siteDir(repoId, sha) : null;
  } catch {
    return null;
  }
}

function serveFile(site: string, urlPath: string, res: http.ServerResponse) {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    rel = urlPath;
  }
  let file = path.join(site, path.normalize(rel));
  if (file !== site && !file.startsWith(site + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  // Single-page apps: unknown extensionless paths fall back to index.html.
  if (!fs.existsSync(file) && !path.extname(rel)) file = path.join(site, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    // Builds never change, but keep HTML revalidating so a rebuilt failed commit shows up.
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(file).pipe(res);
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

const cliEntry = () => path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts');

/** Runs a CLI command in a detached background process. */
export function spawnCli(args: string[], logTo?: string) {
  const out = logTo ? fs.openSync(logTo, 'a') : 'ignore';
  const child = spawn(process.execPath, [cliEntry(), ...args], { detached: true, stdio: ['ignore', out, out], env: process.env });
  child.unref();
}

export function startServer(port: number): Promise<void> {
  const clients = new Set<http.ServerResponse>();
  const broadcast = (data: object) => {
    const payload = `event: change\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  };

  // Any meta.json change under builds/<repo>/… notifies the app.
  fs.mkdirSync(buildsRoot(), { recursive: true });
  const pending = new Map<string, NodeJS.Timeout>();
  fs.watch(buildsRoot(), { recursive: true }, (_event, filename) => {
    const repo = filename?.toString().split(path.sep)[0];
    if (!repo || !filename?.toString().endsWith('meta.json')) return;
    clearTimeout(pending.get(repo));
    pending.set(repo, setTimeout(() => broadcast({ repo }), 150));
  });

  const handler: http.RequestListener = (req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    const url = new URL(req.url ?? '/', 'http://localhost');

    const buildHost = host.match(BUILD_HOST);
    if (buildHost) {
      const site = findBuild(buildHost[2], buildHost[1]);
      if (!site) return void res.writeHead(404, { 'Content-Type': 'text/plain' }).end('No build for this commit.');
      return serveFile(site, url.pathname, res);
    }

    const origin = req.headers.origin;
    const allowed = !!origin && isAllowedOrigin(origin);
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      // Chrome asks before a public site (the deployed app) may reach localhost.
      if (allowed && req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      return void res.writeHead(204).end();
    }

    // Path-based fallback for browsers that don't resolve *.localhost:
    // /b/<repo>/<sha7>/… (works for builds that use relative asset paths).
    const fallback = url.pathname.match(/^\/b\/([a-z0-9-]+)\/([0-9a-f]{7,40})(\/.*)?$/);
    if (fallback) {
      const site = findBuild(fallback[1], fallback[2]);
      if (!site) return void res.writeHead(404).end('No build for this commit.');
      return serveFile(site, fallback[3] ?? '/', res);
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api') return json(res, 404, { error: 'Not found' });

    if (parts[1] === 'health') return json(res, 200, { ok: true, api: API_VERSION });

    if (parts[1] === 'events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    if (parts[1] === 'repos' && parts.length === 2) {
      return json(
        res,
        200,
        readRepos().map((r) => {
          const versions = readVersions(r.id);
          return { id: r.id, name: r.name, kind: r.kind, path: r.path, marker: r.marker, versions: versions.length, latest: versions.at(-1)?.date ?? null };
        }),
      );
    }

    const repo = parts[1] === 'repos' && parts[2] ? getRepo(parts[2]) : undefined;
    if (!repo) return json(res, 404, { error: 'Unknown repo' });

    if (parts[3] === 'versions' && parts.length === 4) return json(res, 200, apiVersions(repo.id));

    if (parts[3] === 'versions' && parts[5] === 'log') {
      const sha = readVersions(repo.id).find((v) => v.sha.startsWith(parts[4] ?? '-'))?.sha;
      const file = sha && logFile(repo.id, sha);
      if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'No log' });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void fs.createReadStream(file).pipe(res);
    }

    if (parts[3] === 'backfill' && req.method === 'POST') {
      if (repo.kind === 'local') spawnCli(['backfill', '--cwd', repo.path!]);
      else void syncRemote(repo).catch(() => {});
      return json(res, 202, { ok: true });
    }

    return json(res, 404, { error: 'Not found' });
  };

  // Hosted sources have no hook: poll them.
  const pollRemotes = () => {
    for (const repo of readRepos().filter((r) => r.kind !== 'local')) {
      syncRemote(repo).catch((err) => console.error(`[${repo.id}] ${err.message}`));
    }
  };
  pollRemotes();
  setInterval(pollRemotes, REMOTE_POLL_MS).unref();

  // Loopback only, on both IPv4 and IPv6 (browsers may resolve *.localhost to either).
  const listen = (hostname: string) =>
    new Promise<void>((resolve, reject) => {
      const server = http.createServer(handler);
      server.once('error', reject);
      server.listen(port, hostname, () => resolve());
    });
  return listen('127.0.0.1').then(() => listen('::1').catch(() => {}));
}

/** True when a companion server answers on `port`. */
export async function isServerRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(600) });
    return res.ok;
  } catch {
    return false;
  }
}
