import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Git sets these while running hooks; inherited, they would point our own
// git calls (and builds) at the wrong index or repository.
const HOOK_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR'];
export function scrubGitEnv() {
  for (const key of HOOK_VARS) delete process.env[key];
}

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export const repoRoot = (cwd: string) => git(cwd, ['rev-parse', '--show-toplevel']);
export const currentBranch = (cwd: string) => git(cwd, ['branch', '--show-current']);
export const hooksDir = (cwd: string) => path.resolve(cwd, git(cwd, ['rev-parse', '--git-path', 'hooks']));

export interface CommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  message: string;
}

export function commitInfo(cwd: string, ref = 'HEAD'): CommitInfo {
  const [sha, shortSha, author, date, message] = git(cwd, ['log', '-1', '--format=%H%x00%h%x00%an%x00%cI%x00%B', ref]).split('\0');
  return { sha, shortSha, author, date, message: message.trim() };
}

/** Commits reachable from HEAD, newest first, whose message passes `keep`. */
export function listCommits(cwd: string, keep: (message: string) => boolean, limit = 200): CommitInfo[] {
  const out = git(cwd, ['log', `-n${limit}`, '--format=%H%x00%h%x00%an%x00%cI%x00%B%x1e', 'HEAD']);
  return out
    .split('\x1e')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, shortSha, author, date, message] = chunk.split('\0');
      return { sha, shortSha, author, date, message: message.trim() };
    })
    .filter((c) => keep(c.message));
}
