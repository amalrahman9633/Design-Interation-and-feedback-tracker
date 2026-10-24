// organiser: turns marked git commits into Organiser versions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drain, enqueue, enqueueBackfill } from './build.ts';
import { CONFIG_NAME, readRepoConfig, slugify, writeRepoConfig, type RepoConfig } from './config.ts';
import { hooksDir, repoRoot, scrubGitEnv } from './git.ts';
import { buildUrl, home, port, serverLog } from './paths.ts';
import { syncRemote } from './remote.ts';
import { isServerRunning, spawnCli, startServer } from './server.ts';
import { findRepoByPath, getRepo, readRepos, readVersions, saveConfig, saveRepo, type RepoEntry } from './store.ts';

const HELP = `organiser: turn marked git commits into Organiser versions

Usage (inside a prototype repo):
  organiser init [--name N] [--marker "[v]"] [--build CMD] [--install CMD] [--out DIR]
      Detects the build, writes ${CONFIG_NAME}, installs a post-commit hook.
  organiser backfill [--limit 200]   Build older marked commits on this branch.
  organiser capture [REF] [--force]  Build one commit now (marker optional with --force).
  organiser status                   List this repo's versions.

Anywhere:
  organiser serve                    Serve builds + the API for the app (port ${port()}).
  organiser connect vercel --project ID [--team ID] [--name N] [--token T]
  organiser connect netlify --site ID [--name N] [--token T]
      Use a hosted provider's deploy previews instead of local builds.
      Tokens can also come from VERCEL_TOKEN / NETLIFY_TOKEN.

Commit with the marker (default "[v]") to create a version:
  git commit -m "Tighter header spacing [v]"
`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);

function fail(message: string): never {
  console.error(`organiser: ${message}`);
  process.exit(1);
}

function localRepo(cwd: string): { repo: RepoEntry; config: RepoConfig } {
  let root: string;
  try {
    root = repoRoot(cwd);
  } catch {
    fail('not inside a git repository.');
  }
  const repo = findRepoByPath(root);
  if (!repo) fail(`this repo isn't set up yet. Run \`organiser init\` in ${root}.`);
  return { repo, config: readRepoConfig(root) };
}

async function ensureServer() {
  if (await isServerRunning(port())) return;
  fs.mkdirSync(home(), { recursive: true });
  spawnCli(['serve'], serverLog());
}

const HOOK_BEGIN = '# >>> organiser';
const HOOK_END = '# <<< organiser';
const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Adds (or refreshes) our block in the post-commit hook, keeping anything else in it. */
function installHook(root: string) {
  const dir = hooksDir(root);
  const file = path.join(dir, 'post-commit');
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts');
  const env = ['ORGANISER_HOME', 'ORGANISER_PORT']
    .filter((k) => process.env[k])
    .map((k) => `${k}=${shellQuote(process.env[k]!)} `)
    .join('');
  const block = [
    HOOK_BEGIN,
    '# Builds commits marked for Organiser in the background; never blocks the commit.',
    `${env}nohup ${shellQuote(process.execPath)} ${shellQuote(cli)} capture --hook --cwd "$(pwd)" >/dev/null 2>&1 &`,
    HOOK_END,
  ].join('\n');

  fs.mkdirSync(dir, { recursive: true });
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '#!/bin/sh\n';
  const start = content.indexOf(HOOK_BEGIN);
  const end = content.indexOf(HOOK_END);
  if (start !== -1 && end !== -1) content = content.slice(0, start) + block + content.slice(end + HOOK_END.length);
  else content = `${content.replace(/\n*$/, '\n')}\n${block}\n`;
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
  return file;
}

function uniqueId(name: string, root: string) {
  const base = slugify(name);
  const taken = new Set(readRepos().filter((r) => r.path !== root).map((r) => r.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

async function main() {
  scrubGitEnv();
  const [command = 'help', ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const cwd = path.resolve(str(flags.cwd) ?? process.cwd());

  switch (command) {
    case 'init': {
      let root: string;
      try {
        root = repoRoot(cwd);
      } catch {
        fail('run this inside the git repository of a prototype.');
      }
      const config: RepoConfig = { ...readRepoConfig(root) };
      if (str(flags.name)) config.name = str(flags.name)!;
      if (str(flags.marker)) config.marker = str(flags.marker)!;
      if (str(flags.build)) config.build = str(flags.build)!;
      if (str(flags.install)) config.install = str(flags.install)!;
      if (str(flags.out)) config.out = str(flags.out)!;
      if (flags['no-build']) config.build = null;
      writeRepoConfig(root, config);

      const existing = findRepoByPath(root);
      const repo: RepoEntry = {
        id: existing?.id ?? uniqueId(config.name, root),
        name: config.name,
        kind: 'local',
        path: root,
        marker: config.marker,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
      };
      saveRepo(repo);
      const hook = installHook(root);
      console.log(`Set up "${repo.name}" (${repo.id})
  install: ${config.install ?? '(none)'}
  build:   ${config.build ?? '(none, files served as committed)'}
  output:  ${config.out}
  config:  ${path.join(root, CONFIG_NAME)}   (edit if the guess is wrong)
  hook:    ${hook}

Commit with "${config.marker}" in the message to create a version, e.g.
  git commit -m "Tighter header spacing ${config.marker}"
Then in Organiser: Connect a git repo → ${repo.name}.
Older marked commits: organiser backfill`);
      await ensureServer();
      return;
    }

    case 'capture': {
      const { repo, config } = localRepo(cwd);
      const entry = enqueue(repo, config, positional[0] ?? 'HEAD', !!flags.force);
      if (flags.hook) {
        if (!entry) return;
        await ensureServer();
        await drain(repo, config);
        return;
      }
      if (!entry) {
        console.log(`Nothing to do: the commit has no "${config.marker}" marker or is already built. Use --force to build it anyway.`);
        return;
      }
      await ensureServer();
      await drain(repo, config, console.log);
      console.log(buildUrl(repo.id, entry.sha));
      return;
    }

    case 'backfill': {
      const { repo, config } = localRepo(cwd);
      const queued = enqueueBackfill(repo, config, Number(str(flags.limit) ?? 200));
      console.log(queued.length ? `Queued ${queued.length} marked commits.` : `No new commits with "${config.marker}" found.`);
      await ensureServer();
      await drain(repo, config, console.log);
      return;
    }

    case 'status': {
      const { repo } = localRepo(cwd);
      const versions = readVersions(repo.id).reverse();
      if (!versions.length) console.log(`No versions yet. Commit with "${repo.marker}" in the message.`);
      for (const v of versions) {
        console.log(`${v.shortSha}  ${v.status.padEnd(8)}  ${v.subject}${v.status === 'ready' ? `\n          ${buildUrl(repo.id, v.sha)}` : ''}`);
      }
      return;
    }

    case 'serve': {
      const p = Number(str(flags.port) ?? port());
      if (await isServerRunning(p)) {
        console.log(`Already running on http://localhost:${p}`);
        return;
      }
      await startServer(p);
      console.log(`Organiser companion on http://localhost:${p} (builds at http://<sha>.<repo>.localhost:${p})`);
      return;
    }

    case 'connect': {
      const provider = positional[0];
      if (provider !== 'vercel' && provider !== 'netlify') fail('usage: organiser connect vercel|netlify …');
      const token = str(flags.token) ?? process.env[provider === 'vercel' ? 'VERCEL_TOKEN' : 'NETLIFY_TOKEN'];
      if (token) saveConfig(provider === 'vercel' ? { vercelToken: token } : { netlifyToken: token });
      const remoteId = str(provider === 'vercel' ? flags.project : flags.site);
      if (!remoteId) fail(provider === 'vercel' ? '--project <projectId> is required.' : '--site <siteId> is required.');
      const name = str(flags.name) ?? remoteId;
      const id = slugify(`${name}-${provider}`);
      const repo: RepoEntry = {
        id,
        name,
        kind: provider,
        remote: provider === 'vercel' ? { projectId: remoteId, teamId: str(flags.team) } : { siteId: remoteId },
        marker: str(flags.marker) ?? getRepo(id)?.marker ?? '[v]',
        addedAt: getRepo(id)?.addedAt ?? new Date().toISOString(),
      };
      saveRepo(repo);
      try {
        const changed = await syncRemote(repo);
        console.log(`Connected "${name}" (${id}): ${changed} marked deploys found. The companion re-checks every 30 seconds.`);
      } catch (err) {
        fail(`saved, but the first sync failed: ${err instanceof Error ? err.message : err}`);
      }
      await ensureServer();
      return;
    }

    default:
      console.log(HELP);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
