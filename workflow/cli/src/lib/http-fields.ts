import type { NameValue } from './types';

/** Ordered decoded pairs preserve repeated query names and empty values. */
export function queryFromUrl(url: string): NameValue[] {
  return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
}
