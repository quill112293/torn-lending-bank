import {createSessionStore, validSession} from './session-store.js';
import {createRequestLog} from './diagnostics.js';
import {validTornKey} from './api-key.js';

export function normalizeOrigin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw Error('Enter only the HTTPS bank address.');
  return u.origin;
}

export function createTransport(origin, {native = false, onExpired = () => {}, store = createSessionStore(origin, {native})} = {}) {
  origin = normalizeOrigin(origin);
  let bearer = '', expiresAt = 0, remembered = false, notice = '', epoch = 0, writes = Promise.resolve();
  const requestLog = createRequestLog();
  let bankRead = null;
  const hasSession = () => !!bearer && expiresAt > Date.now();
  // Serialize persistence so a slow save cannot restore a session after sign-out.
  function persist(value) {
    writes = writes.then(() => value ? store.write(value) : store.remove()).catch(() => {
      remembered = false;
      notice = value ? 'Signed in for this session. This device could not save your login.' : 'Could not remove the saved login from this device. Use Log out again when connected.';
    });
    return writes;
  }
  const ready = (async () => {
    const initialEpoch = epoch;
    try {
      const saved = await store.read();
      if (epoch !== initialEpoch) return;
      if (validSession(saved, origin)) {
        bearer = saved.token; expiresAt = saved.expiresAt; remembered = true;
      } else if (saved) await persist(null);
    } catch { notice = 'Saved login is unavailable. You can still sign in for this session.'; }
  })();
  async function clear() {
    bankRead = null;
    epoch++; bearer = ''; expiresAt = 0; remembered = false; notice = '';
    await persist(null);
  }
  // Share only in-flight bank reads. Never cache results or combine writes.
  // A write or session change invalidates the read so its next refresh is fresh.
  function request(path, body, options = {}) {
    if (body !== undefined) {
      bankRead = null;
      return send(path, body, options).finally(() => { bankRead = null; });
    }
    if (path !== 'bank') return send(path, body, options);
    if (bankRead) return bankRead;
    const pending = send(path, body, options).finally(() => {
      if (bankRead === pending) bankRead = null;
    });
    bankRead = pending;
    return pending;
  }
  async function send(path, body, {remember = false} = {}) {
    await ready;
    if (bearer && !hasSession()) await clear();
    if (body !== undefined && ['link', 'check', 'trades'].includes(path) && !validTornKey(body?.key)) {
      throw Error(path === 'link' ? 'Enter a valid 16-character Torn API key.' : 'Enter a valid 16-character Torn API key in Connections before running live checks.');
    }
    const requestEpoch = epoch;
    const method = body === undefined ? 'GET' : 'POST', headers = {Accept: 'application/json'};
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['x-tlb-action'] = '1'; }
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    const url = origin + '/api/' + path, payload = body === undefined ? undefined : JSON.stringify(body);
    const record = requestLog.start(path, method);
    let res, driver = 'browser';
    try {
      if (native && typeof PDA_httpGet === 'function' && typeof PDA_httpPost === 'function') {
        driver = 'Torn PDA';
        // Cloudflare recommends an application User-Agent for native HTTP clients.
        headers['User-Agent'] = 'TornLendingBank/1.1.0-beta.19 (TornPDA userscript)';
        let timer;
        try {
          res = await Promise.race([
            method === 'GET' ? PDA_httpGet(url, headers) : PDA_httpPost(url, headers, payload),
            new Promise((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), 25000); }),
          ]);
        } finally { clearTimeout(timer); }
      } else if (native && typeof GM_xmlhttpRequest === 'function') {
        driver = 'userscript';
        headers['User-Agent'] = 'TornLendingBank/1.1.0-beta.19 (userscript)';
        res = await new Promise((resolve, reject) => GM_xmlhttpRequest({method, url, headers, data: payload, timeout: 25000, anonymous: true, onload: resolve, onerror: reject, ontimeout: reject}));
      } else {
        const r = await fetch(url, {method, headers, body: payload, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(25000)});
        res = {status: r.status, responseText: await r.text()};
      }
    } catch { record(driver, 'network_error'); throw Error('Connection interrupted. Refresh the bank before retrying a save.'); }
    // Never display an upstream response body: it may contain sensitive details.
    const status = Number(res?.status) || 0;
    if (status === 401) {
      record(driver, 'session_expired', res);
      if (epoch === requestEpoch) { await clear(); onExpired(); }
      throw Error('Your bank session ended. Sign in again.');
    }
    let data;
    try {
      data = JSON.parse(res.responseText);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('shape');
    } catch {
      record(driver, status ? 'unreadable_response' : 'missing_http_status', res);
      if (status === 403 && /(?:error code:|error)\s*1010\b/i.test(String(res?.responseText))) {
        throw Error('Cloudflare blocked this connection (1010). Update the bank script, then refresh. If it continues, open the bank in your browser.');
      }
      throw Error('Bank returned an unreadable response (HTTP ' + status + ', ' + driver + '). Refresh the bank before retrying a save.');
    }
    if (status < 200 || status >= 300 || data.error) {
      record(driver, status ? 'http_error' : 'missing_http_status', res);
      throw Error(typeof data.error === 'string' ? data.error : 'Bank request failed (HTTP ' + status + ').');
    }
    if (epoch !== requestEpoch) { record(driver, 'session_changed', res); throw Error('Your login changed. Refresh the bank.'); }
    if (path === 'link') {
      const session = {origin, token: data.token, expiresAt: data.expiresAt};
      delete data.token;
      if (!validSession(session, origin)) { record(driver, 'invalid_login', res); throw Error('The bank returned an invalid login. Please try again.'); }
      bearer = session.token; expiresAt = session.expiresAt; remembered = remember; notice = '';
      await persist(remember ? session : null);
    }
    record(driver, 'ok', res);
    return data;
  }
  return {
    ready, request, hasSession, clear, isRemembered: () => remembered && hasSession(), notice: () => notice,
    diagnostics: () => ({bankOrigin: origin, native, sessionActive: hasSession(), remembered: remembered && hasSession(),
      storage: ['torn-pda', 'userscript', 'browser'].includes(store.kind) ? store.kind : 'custom',
      capabilities: {pdaGet: typeof PDA_httpGet === 'function', pdaPost: typeof PDA_httpPost === 'function', userscriptRequest: typeof GM_xmlhttpRequest === 'function', browserFetch: typeof fetch === 'function'},
      recentRequests: requestLog.snapshot()}),
    async forget() { remembered = false; notice = ''; await persist(null); },
    async logout() {
      await ready;
      try { if (hasSession()) await request('logout', {}); }
      finally { await clear(); }
    },
  };
}
