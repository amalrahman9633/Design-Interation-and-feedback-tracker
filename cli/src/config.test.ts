import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeCommit, detectConfig, hasMarker, slugify } from './config.ts';

function tempDir(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organiser-detect-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

describe('markers', () => {
  it('matches case-insensitively and strips the marker from the subject', () => {
    expect(hasMarker('Tighter header [V]', '[v]')).toBe(true);
    expect(hasMarker('Tighter header', '[v]')).toBe(false);
    expect(describeCommit('Tighter  header [v]\n\nMoved the CTA up.', '[v]')).toEqual({
      subject: 'Tighter header',
      body: 'Moved the CTA up.',
    });
    expect(describeCommit('[v]', '[v]').subject).toBe('(no message)');
  });
});

describe('slugify', () => {
  it('makes DNS-safe ids', () => {
    expect(slugify('Payment Prototype v3!')).toBe('payment-prototype-v3');
    expect(slugify('***')).toBe('prototype');
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

describe('detectConfig', () => {
  it('detects a Vite app with a lockfile', () => {
    const dir = tempDir({
      'package.json': JSON.stringify({ name: '@me/proto', scripts: { build: 'vite build' }, devDependencies: { vite: '*' } }),
      'package-lock.json': '{}',
    });
    expect(detectConfig(dir)).toMatchObject({ name: 'proto', install: 'npm ci', build: 'npm run build', out: 'dist' });
  });

  it('detects pnpm + Next static export', () => {
    const dir = tempDir({
      'package.json': JSON.stringify({ scripts: { build: 'next build' }, dependencies: { next: '*' } }),
      'pnpm-lock.yaml': '',
    });
    expect(detectConfig(dir)).toMatchObject({ install: 'pnpm install --frozen-lockfile', build: 'pnpm run build', out: 'out' });
  });

  it('serves plain HTML as committed', () => {
    const dir = tempDir({ 'index.html': '<h1>hi</h1>' });
    expect(detectConfig(dir)).toMatchObject({ install: null, build: null, out: '.' });
  });
});
