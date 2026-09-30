const { isDeepStrictEqual } = require('node:util');

/** Independent export oracle for the capture representations supported by the HAR harness.
 * Do not call production serializers here: the comparison must detect shared replay/export bugs.
 */
function requestPayloadMatches(capture, exported) {
  const metadata = capture.bodyMeta;
  if (metadata?.representation === 'text') return exported?.mode === 'raw' && exported.raw === capture.body;
  if (metadata?.representation === 'params') {
    const mime = metadata.mimeType?.split(';', 1)[0].trim().toLowerCase();
    if (mime === 'application/x-www-form-urlencoded') {
      const text = capture.body.map((param) => `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`).join('&');
      return exported?.mode === 'raw' && exported.raw === text;
    }
    if (mime === 'multipart/form-data') {
      const fields = capture.body.map((param) => ({ key: param.name, value: param.value, type: 'text',
        ...(param.contentType === undefined ? {} : { contentType: param.contentType }) }));
      return exported?.mode === 'formdata' && isDeepStrictEqual(exported.formdata, fields);
    }
    return false;
  }
  if (metadata?.representation === 'json') return exported?.raw === JSON.stringify(capture.body);
  if (capture.body === null) return exported === undefined;
  return false;
}

function captureFidelity(expected, collection) {
  const remaining = new Set(expected.keys());
  let mismatches = 0;
  for (const folder of collection.item) {
    for (const item of folder.item) {
      const saved = item.response?.[0];
      const frame = expected.get(saved?.name);
      if (!frame || !remaining.delete(saved.name)) { mismatches += 1; continue; }
      const url = new URL(frame.request.url);
      const responseText = frame.response.bodyMeta?.representation === 'json'
        ? JSON.stringify(frame.response.body, null, 2)
        : frame.response.body === null ? '' : String(frame.response.body);
      if (item.request.method !== frame.request.method ||
          item.request.url.raw !== `{{baseUrl}}${url.pathname}${url.search}` ||
          !requestPayloadMatches(frame.request, item.request.body) ||
          saved.code !== frame.response.status || saved.body !== responseText) mismatches += 1;
    }
  }
  return { mismatches: mismatches + remaining.size };
}

module.exports = { captureFidelity };
