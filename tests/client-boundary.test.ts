import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const clientRoots = ['components', 'context', 'hooks', 'lib', 'pages'];
const sourceExtensions = new Set(['.ts', '.tsx']);
const allowedSupabaseAdminFiles = new Set(['lib\\supabase.ts', 'lib/supabase.ts']);

const walk = (dir: string): string[] => {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path));
      continue;
    }

    if ([...sourceExtensions].some(ext => path.endsWith(ext))) {
      files.push(path);
    }
  }

  return files;
};

describe('Client/server security boundary', () => {
  it('does not use supabaseAdmin from browser-facing source files', () => {
    const root = process.cwd();
    const violations: string[] = [];

    for (const sourceRoot of clientRoots) {
      for (const file of walk(join(root, sourceRoot))) {
        const rel = relative(root, file);
        if (allowedSupabaseAdminFiles.has(rel)) continue;

        const source = readFileSync(file, 'utf8');
        if (source.includes('supabaseAdmin')) {
          violations.push(rel);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not expose service-role env names to Vite client code', () => {
    const root = process.cwd();
    const violations: string[] = [];

    for (const sourceRoot of clientRoots) {
      for (const file of walk(join(root, sourceRoot))) {
        const rel = relative(root, file);
        const source = readFileSync(file, 'utf8');
        if (/VITE_.*SERVICE.*ROLE|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE/i.test(source)) {
          violations.push(rel);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

