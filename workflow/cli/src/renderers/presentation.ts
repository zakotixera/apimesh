import path from 'node:path';
import type { LoadedApi, LoadedExample } from '../lib/canonical';
import { bodyForAnalysis } from '../lib/body';
import { compareCodepoint } from '../lib/stable-json';

/** Links are relative to a generated file; canonical paths are repository-relative. */
export function linkFrom(output: string, target: string): string {
  return path.posix.relative(path.posix.dirname(`dist/${output}`), target).split('/').map(encodeURIComponent).join('/');
}

export function definitionPath(api: LoadedApi): string {
  return api.relFile || `apis/${api.relDir}/definition.json`;
}

export function examplePath(api: LoadedApi, example: LoadedExample): string {
  return example.relFile || `apis/${api.relDir}/examples/${example.name}`;
}

export function origins(api: LoadedApi): string[] {
  return [...new Set(api.examples.map((ex) => new URL(ex.data.request.url).origin))].sort(compareCodepoint);
}

export function cell(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;').replace(/`/g, '&#96;').replace(/\r?\n/g, ' ');
}

/** Labels use observed event fields only; canonical filenames remain the identity. */
export function recordingLabel(ex: LoadedExample, index: number): string {
  const body = bodyForAnalysis(ex.data.request);
  const fields: string[] = [];
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const values = body as Record<string, unknown>;
    if (typeof values.event === 'string') fields.push(values.event);
    if (values.ext && typeof values.ext === 'object') {
      const ext = values.ext as Record<string, unknown>;
      for (const key of ['category', 'stage']) if (typeof ext[key] === 'string') fields.push(ext[key] as string);
    }
  }
  return [`Recording ${String(index + 1).padStart(2, '0')}`, ...fields.map((s) => s.replace(/[\r\n]/g, ' ').slice(0, 60)), ex.data.captured].join(' · ');
}

export function placeholders(value: unknown): string[] {
  return [...new Set([...JSON.stringify(value).matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]))].sort(compareCodepoint);
}
