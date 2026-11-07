// Capture only an explicit allowlist of metadata. Never retain request/response bodies.
const operations = new Set(['link', 'logout', 'bank', 'check', 'trades', 'market', 'access', 'health']);
const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
export function responseMetadata(response) {
  const value = response?.status;
  const status = (typeof value === 'number' || typeof value === 'string' && /^\d{1,3}$/.test(value)) ? Number(value) : null;
  return {
    responseType: typeOf(response),
    status: Number.isInteger(status) && status >= 0 && status <= 599 ? status : null,
    statusType: typeOf(value),
    bodyType: typeOf(response?.responseText),
    bodyLength: typeof response?.responseText === 'string' ? response.responseText.length : null,
    alternateFieldTypes: Object.fromEntries(['statusCode', 'body', 'data', 'response', 'error'].map(key => [key, typeOf(response?.[key])])),
  };
}

export function createRequestLog(limit = 16) {
  const entries = [];
  let sequence = 0;
  return {
    start(path, method) {
      const id = ++sequence, start = Date.now();
      const operation = String(path).split(/[/?]/)[0];
      let finished = false;
      return (driver, outcome, response) => {
        if (finished) return;
        finished = true;
        entries.push({id, at: new Date(start).toISOString(), operation: operations.has(operation) ? operation : 'other', method,
          driver, outcome, elapsedMs: Math.max(0, Date.now() - start), ...responseMetadata(response)});
        if (entries.length > limit) entries.shift();
      };
    },
    snapshot: () => entries.map(entry => ({...entry, alternateFieldTypes: {...entry.alternateFieldTypes}})).sort((a,b) => a.id-b.id),
  };
}
