// Queue marked commits and build each one in a temporary git worktree, so
// the developer's working copy is never touched.

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { describeCommit, hasMarker, type RepoConfig } from './config.ts';
import { commitInfo, currentBranch, git, listCommits } from './git.ts';
import { buildDir, depsCache, lockFile, logFile, siteDir, workDir } from './paths.ts';
import { readVersion, readVersions, updateVersion, writeVersion, type RepoEntry, type VersionEntry } from './store.ts';

const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Adds a commit to the build queue. Returns null when it isn't marked (and
 * not forced) or is already built/queued.
 */
export function enqueue(repo: RepoEntry, config: RepoConfig, ref = 'HEAD', force = false): VersionEntry | null {
  const root = repo.path!;
  const info = commitInfo(root, ref);
  if (!force && !hasMarker(info.message, config.marker)) return null;
  const existing = readVersion(repo.id, info.sha);
  if (existing && !(force && existing.status === 'failed')) return null;

  const { subject, body } = describeCommit(info.message, config.marker);
  const entry: VersionEntry = {
    sha: info.sha,
    shortSha: info.shortSha,
    subject,
    body,
    author: info.author,
    date: info.date,
    branch: ref === 'HEAD' ? currentBranch(root) : '',
    status: 'queued',
    provider: 'local',
  };
  writeVersion(repo.id, entry);
  return entry;
}

/** Queues every marked commit on the current branch that isn't known yet. */
export function enqueueBackfill(repo: RepoEntry, config: RepoConfig, limit = 200): VersionEntry[] {
  const branch = currentBranch(repo.path!);
  return listCommits(repo.path!, (m) => hasMarker(m, config.marker), limit)
    .filter((c) => !readVersion(repo.id, c.sha))
    .map((c) => {
      const { subject, body } = describeCommit(c.message, config.marker);
      const entry: VersionEntry = {
        sha: c.sha,
        shortSha: c.shortSha,
        subject,
        body,
        author: c.author,
        date: c.date,
        branch,
        status: 'queued',
        provider: 'local',
      };
      writeVersion(repo.id, entry);
      return entry;
    });
}

// --- Lock: one builder per repo ----------------------------------------------

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(repoId: string): boolean {
  const file = lockFile(repoId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (pid && isAlive(pid)) return false;
      fs.rmSync(file, { force: true }); // stale lock from a crashed builder
    }
  }
  return false;
}

const releaseLock = (repoId: string) => fs.rmSync(lockFile(repoId), { force: true });

/**
 * Builds queued commits until none are left. Returns immediately if another
 * process is already building this repo (it will pick up new queue entries).
 */
export async function drain(repo: RepoEntry, config: RepoConfig, log: (line: string) => void = () => {}) {
  if (!acquireLock(repo.id)) return;
  try {
    // Holding the lock means anything marked "building" was left by a crash.
    for (const v of readVersions(repo.id)) {
      if (v.status === 'building') updateVersion(repo.id, v.sha, { status: 'queued' });
    }
    for (;;) {
      const next = readVersions(repo.id).find((v) => v.status === 'queued');
      if (!next) break;
      log(`Building ${next.shortSha} ${next.subject}`);
      await buildOne(repo, config, next);
      log(`  → ${readVersion(repo.id, next.sha)?.status}`);
    }
  } finally {
    releaseLock(repo.id);
  }
}

// --- Building ----------------------------------------------------------------

function run(command: string, cwd: string, out: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    out.write(`\n$ ${command}\n`);
    const child = spawn(command, {
      cwd,
      shell: true,
      // Hooks can run with a minimal PATH; make sure the node we run under is found.
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
        CI: '1',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        ORGANISER_BUILD: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    const timer = setTimeout(() => child.kill('SIGTERM'), BUILD_TIMEOUT_MS);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(signal ? `\`${command}\` was stopped (${signal})` : `\`${command}\` exited with code ${code}`));
    });
  });
}

const execFileAsync = promisify(execFile);

/** Recursive copy that keeps symlinks as they are (relative links stay relative). */
async function copyTree(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (process.platform === 'darwin') {
    // APFS clones: near-instant and no extra disk space.
    await execFileAsync('cp', ['-cR', from, to]);
  } else {
    fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  }
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'package.json'];

/**
 * Installs dependencies, reusing a cached node_modules for an identical
 * lockfile + install command so most commits skip the install entirely.
 */
async function installDeps(repo: RepoEntry, config: RepoConfig, work: string, out: fs.WriteStream) {
  if (!config.install) return;
  const lock = LOCKFILES.find((f) => fs.existsSync(path.join(work, f)));
  const hash = createHash('sha256')
    .update(config.install)
    .update(lock ? fs.readFileSync(path.join(work, lock)) : '')
    .digest('hex')
    .slice(0, 16);
  const cache = depsCache(repo.id, hash);
  const target = path.join(work, 'node_modules');

  if (fs.existsSync(cache)) {
    out.write(`\nReusing cached dependencies (${hash})\n`);
    await copyTree(cache, target);
    return;
  }
  await run(config.install, work, out);
  if (fs.existsSync(target)) await copyTree(target, cache).catch(() => fs.rmSync(cache, { recursive: true, force: true }));
}

function removeWorktree(root: string, work: string) {
  try {
    git(root, ['worktree', 'remove', '--force', work]);
  } catch {
    fs.rmSync(work, { recursive: true, force: true });
  }
  try {
    git(root, ['worktree', 'prune']);
  } catch {
    /* nothing to prune */
  }
}

const SKIP_IN_SITE = new Set(['.git', 'node_modules']);

async function buildOne(repo: RepoEntry, config: RepoConfig, entry: VersionEntry) {
  const root = repo.path!;
  const work = workDir(repo.id, entry.sha);
  fs.mkdirSync(buildDir(repo.id, entry.sha), { recursive: true });
  const out = fs.createWriteStream(logFile(repo.id, entry.sha));
  updateVersion(repo.id, entry.sha, { status: 'building', startedAt: new Date().toISOString(), error: undefined });

  try {
    out.write(`Building ${entry.shortSha} ${entry.subject}\n`);
    removeWorktree(root, work);
    fs.mkdirSync(path.dirname(work), { recursive: true });
    git(root, ['worktree', 'add', '--detach', work, entry.sha]);

    await installDeps(repo, config, work, out);
    if (config.build) await run(config.build, work, out);

    const builtDir = path.resolve(work, config.out);
    if (!fs.existsSync(path.join(builtDir, 'index.html'))) {
      throw new Error(`No index.html in "${config.out}". Check "out" in organiser.config.json.`);
    }
    const site = siteDir(repo.id, entry.sha);
    fs.rmSync(site, { recursive: true, force: true });
    fs.cpSync(builtDir, site, {
      recursive: true,
      filter: (src) => !path.relative(builtDir, src).split(path.sep).some((part) => SKIP_IN_SITE.has(part)),
    });
    out.write('\nDone.\n');
    updateVersion(repo.id, entry.sha, { status: 'ready', finishedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    out.write(`\nFailed: ${message}\n`);
    updateVersion(repo.id, entry.sha, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
  } finally {
    removeWorktree(root, work);
    await new Promise((resolve) => out.end(resolve));
  }
}
