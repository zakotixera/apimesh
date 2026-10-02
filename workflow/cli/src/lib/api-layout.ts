import type { LoadedApi } from './canonical';

/** Keep DNS names readable while escaping ports and IPv6 for portable directories. */
export function hostDirectory(url: string): string {
  const host = new URL(url).host;
  let segment = encodeURIComponent(host).replace(/\.$/, '%2E');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) {
    segment = `%${segment.charCodeAt(0).toString(16).toUpperCase()}${segment.slice(1)}`;
  }
  return segment;
}

/** Directory relative to apis; the root endpoint lives directly under its host. */
export function endpointDirectory(url: string): string {
  const pathname = new URL(url).pathname;
  return hostDirectory(url) + (pathname === '/' ? '' : pathname);
}

export function apiHost(api: LoadedApi): string {
  if (api.definition.endpoint.url) return new URL(api.definition.endpoint.url).host;
  const hosts = [...new Set(api.examples.map((ex) => new URL(ex.data.request.url).host))];
  return hosts.length === 1 ? hosts[0] : hosts.length ? 'Multiple hosts (legacy)' : 'Unknown host (legacy)';
}

/** Legacy evidence links keep their original paths, while generated outputs gain hosts. */
export function artifactDirectory(api: LoadedApi): string {
  if (api.definition.endpoint.url) return endpointDirectory(api.definition.endpoint.url);
  const hosts = new Set(api.examples.map((ex) => new URL(ex.data.request.url).host));
  if (hosts.size === 1) {
    return endpointDirectory(`${new URL(api.examples[0].data.request.url).origin}${api.definition.endpoint.path}`);
  }
  return `_legacy/${api.relDir}`;
}

export function docsFile(api: LoadedApi): string {
  return `docs/endpoints/${artifactDirectory(api)}/index.md`;
}

export function agentFile(api: LoadedApi): string {
  return `agent/endpoints/${artifactDirectory(api)}/index.json`;
}
