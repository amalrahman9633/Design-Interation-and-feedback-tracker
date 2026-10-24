import os from 'node:os';
import path from 'node:path';

/** Everything the companion stores lives here. Override with ORGANISER_HOME. */
export const home = () => process.env.ORGANISER_HOME || path.join(os.homedir(), '.organiser');
export const port = () => Number(process.env.ORGANISER_PORT || 5199);

export const reposFile = () => path.join(home(), 'repos.json');
export const configFile = () => path.join(home(), 'config.json');
export const buildsRoot = () => path.join(home(), 'builds');
export const repoBuilds = (repoId: string) => path.join(buildsRoot(), repoId);
export const buildDir = (repoId: string, sha: string) => path.join(repoBuilds(repoId), sha);
export const siteDir = (repoId: string, sha: string) => path.join(buildDir(repoId, sha), 'site');
export const logFile = (repoId: string, sha: string) => path.join(buildDir(repoId, sha), 'build.log');
export const workDir = (repoId: string, sha: string) => path.join(home(), 'work', repoId, sha);
export const depsCache = (repoId: string, hash: string) => path.join(home(), 'cache', repoId, hash, 'node_modules');
export const lockFile = (repoId: string) => path.join(home(), 'locks', `${repoId}.lock`);
export const serverLog = () => path.join(home(), 'server.log');

/** The immutable URL a local build is served at. */
export const buildUrl = (repoId: string, sha: string) => `http://${sha.slice(0, 7)}.${repoId}.localhost:${port()}/`;
