import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './server.ts';
import { saveConfig } from './store.ts';

beforeEach(() => {
  process.env.ORGANISER_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'organiser-server-'));
});

describe('isAllowedOrigin', () => {
  it('allows the local app, and other sites only when added', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4173')).toBe(true);
    expect(isAllowedOrigin('https://my-organiser.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://evil.vercel.app')).toBe(false);

    saveConfig({ allowedOrigins: ['https://my-organiser.vercel.app'] });
    expect(isAllowedOrigin('https://my-organiser.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://evil.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://my-organiser.vercel.app.evil.com')).toBe(false);
  });
});
