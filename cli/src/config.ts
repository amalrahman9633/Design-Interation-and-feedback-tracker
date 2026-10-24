// Per-repo build settings (organiser.config.json) and stack detection.

import fs from 'node:fs';
import path from 'node:path';

export interface RepoConfig {
  name: string;
  /** Commits whose message contains this become versions. */
  marker: string;
  /** Dependency install command, or null when there is no package.json. */
  install: string | null;
  /** Build command, or null to serve the files as committed. */
  build: string | null;
  /** Folder (relative to the repo root) that holds the built site. */
  out: string;
}

export const CONFIG_NAME = 'organiser.config.json';
export const DEFAULT_MARKER = '[v]';

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'prototype';
}

export function hasMarker(message: string, marker: string): boolean {
  return message.toLowerCase().includes(marker.toLowerCase());
}

export function stripMarker(text: string, marker: string): string {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(escaped, 'gi'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Splits a commit message into subject and body, with the marker removed. */
export function describeCommit(message: string, marker: string) {
  const [subject, ...rest] = stripMarker(message, marker).split('\n');
  return { subject: subject.trim() || '(no message)', body: rest.join('\n').trim() };
}

const exists = (dir: string, file: string) => fs.existsSync(path.join(dir, file));

/** Best guess at install/build/out for the repo at `dir`. */
export function detectConfig(dir: string): RepoConfig {
  const name = path.basename(dir);
  if (!exists(dir, 'package.json')) {
    return { name, marker: DEFAULT_MARKER, install: null, build: null, out: '.' };
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;

  let pm = 'npm';
  let install = 'npm install';
  if (exists(dir, 'pnpm-lock.yaml')) [pm, install] = ['pnpm', 'pnpm install --frozen-lockfile'];
  else if (exists(dir, 'yarn.lock')) [pm, install] = ['yarn', 'yarn install --frozen-lockfile'];
  else if (exists(dir, 'bun.lockb') || exists(dir, 'bun.lock')) [pm, install] = ['bun', 'bun install'];
  else if (exists(dir, 'package-lock.json')) install = 'npm ci';

  const build = pkg.scripts?.build ? `${pm} run build` : null;
  let out = 'dist';
  if (deps.next) out = 'out';
  else if (deps['react-scripts']) out = 'build';
  else if (!build) out = '.';

  return { name: typeof pkg.name === 'string' ? pkg.name.replace(/^@[^/]+\//, '') : name, marker: DEFAULT_MARKER, install, build, out };
}

export function readRepoConfig(dir: string): RepoConfig {
  const detected = detectConfig(dir);
  try {
    return { ...detected, ...JSON.parse(fs.readFileSync(path.join(dir, CONFIG_NAME), 'utf8')) };
  } catch {
    return detected;
  }
}

export function writeRepoConfig(dir: string, config: RepoConfig) {
  fs.writeFileSync(path.join(dir, CONFIG_NAME), JSON.stringify(config, null, 2) + '\n');
}
