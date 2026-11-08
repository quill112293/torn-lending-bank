import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createTransport} from '../src/transport.js';
import {createSessionStore} from '../src/session-store.js';
import {customKeyLink} from '../src/key-link.js';

const origin = 'https://example-bank.workers.dev';
const token = 'a'.repeat(64), apiKey = 'TestOnlyKey00001';
const saved = () => ({origin, token, expiresAt: Date.now() + 3600000});
const json = (data, status = 200) => ({status, responseText: JSON.stringify(data)});
function memory(initial = null) {
  let value = initial;
  return {read: async () => value, write: async v => {value = structuredClone(v);}, remove: async () => {value = null;}, value: () => value};
}
function bridge() {
  const calls = [];
  globalThis.PDA_httpGet = async (url, headers) => {calls.push({url, headers}); return json({ok: true});};
  globalThis.PDA_httpPost = async (url, headers, body) => {
    calls.push({url, headers, body});
    return json(url.endsWith('/link') ? {...saved(), id: 1} : {ok: true});
  };
  return calls;
}
afterEach(() => {
  for (const key of ['PDA_httpGet','PDA_httpPost','PDA_storage','GM_xmlhttpRequest','GM_getValue','GM_setValue','GM_deleteValue','localStorage']) delete globalThis[key];
});

test('remembered login restores after a new transport without keeping the Torn key', async () => {
  const calls = bridge(), store = memory();
  const first = createTransport(origin, {native: true, store});
  const result = await first.request('link', {key: apiKey}, {remember: true});
  assert.equal(result.token, undefined);
  assert.deepEqual(Object.keys(store.value()).sort(), ['expiresAt','origin','token']);
  assert.ok(!JSON.stringify(store.value()).includes(apiKey));
  const reopened = createTransport(origin, {native: true, store});
  await reopened.request('bank'); // Waits for asynchronous storage automatically.
  assert.equal(reopened.isRemembered(), true);
  assert.equal(calls[1].headers.Authorization, 'Bearer ' + token);
  assert.ok(!calls[1].url.includes(token));
  assert.equal(calls[1].body, undefined);
});

test('unchecked remember removes a previous saved login and keeps only the new memory session', async () => {
  bridge(); const store = memory(saved()), transport = createTransport(origin, {native: true, store});
  await transport.request('link', {key: apiKey});
  assert.equal(transport.hasSession(), true);
  assert.equal(transport.isRemembered(), false);
  assert.equal(store.value(), null);
  const reopened = createTransport(origin, {store}); await reopened.ready;
  assert.equal(reopened.hasSession(), false);
});

test('expired, malformed, and other-bank sessions are discarded without requests', async () => {
  for (const value of [{...saved(), expiresAt: 1}, {...saved(), token: 'invalid'}, {...saved(), origin: 'https://other.workers.dev'}, {...saved(), expiresAt: Date.now() + 86400000}]) {
    const store = memory(value), transport = createTransport(origin, {store});
    await transport.ready;
    assert.equal(transport.hasSession(), false); assert.equal(store.value(), null);
  }
});

test('sign out revokes the server session and deletes the local login', async () => {
  const calls = bridge(), store = memory(saved()), transport = createTransport(origin, {native: true, store});
  await transport.logout();
  assert.equal(calls[0].url, origin + '/api/logout');
  assert.equal(calls[0].headers.Authorization, 'Bearer ' + token);
  assert.equal(transport.hasSession(), false); assert.equal(store.value(), null);
});

test('failed sign out still removes the local login and exposes the connection failure', async () => {
  bridge(); globalThis.PDA_httpPost = async () => {throw Error('offline');};
  const store = memory(saved()), transport = createTransport(origin, {native: true, store});
  await assert.rejects(transport.logout(), /Connection interrupted/);
  assert.equal(transport.hasSession(), false); assert.equal(store.value(), null);
});

test('401 discards a revoked session even when the response is HTML', async () => {
  bridge(); globalThis.PDA_httpGet = async () => ({status: 401, responseText: '<html>Unauthorized</html>'});
  let expired = 0;
  const store = memory(saved()), transport = createTransport(origin, {native: true, store, onExpired: () => expired++});
  await assert.rejects(transport.request('bank'), /session ended/);
  assert.equal(expired, 1); assert.equal(store.value(), null); assert.equal(transport.hasSession(), false);
});

test('storage failure permits an in-memory login with a visible notice', async () => {
  bridge();
  const store = {read: async () => null, write: async () => {throw Error('quota');}, remove: async () => {}};
  const transport = createTransport(origin, {native: true, store});
  await transport.request('link', {key: apiKey}, {remember: true});
  assert.equal(transport.hasSession(), true); assert.equal(transport.isRemembered(), false);
  assert.match(transport.notice(), /could not save/);
});

test('a pending storage read cannot restore a session after clear', async () => {
  let finish;
  const store = memory(saved()); store.read = () => new Promise(resolve => {finish = resolve;});
  const transport = createTransport(origin, {store});
  await transport.clear(); finish(saved()); await transport.ready;
  assert.equal(transport.hasSession(), false); assert.equal(store.value(), null);
});

test('a pending login response cannot resurrect a cleared session', async () => {
  bridge(); let finish, started;
  const pending = new Promise(resolve => {started = resolve;});
  globalThis.PDA_httpPost = () => new Promise(resolve => {finish = resolve; started();});
  const store = memory(), transport = createTransport(origin, {native: true, store});
  const request = transport.request('link', {key: apiKey}, {remember: true});
  await pending; await transport.clear(); finish(json(saved()));
  await assert.rejects(request, /login changed/);
  assert.equal(transport.hasSession(), false); assert.equal(store.value(), null);
});

test('forget saved login retains the current in-memory session', async () => {
  const store = memory(saved()), transport = createTransport(origin, {store}); await transport.ready;
  await transport.forget();
  assert.equal(transport.hasSession(), true); assert.equal(transport.isRemembered(), false); assert.equal(store.value(), null);
});

test('PDA GET and POST use descriptive application headers and JSON bodies', async () => {
  const calls = bridge(), transport = createTransport(origin, {native: true, store: memory()});
  await transport.request('link', {key: apiKey}); await transport.request('bank');
  for (const call of calls) assert.match(call.headers['User-Agent'], /^TornLendingBank\/.+TornPDA/);
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), {key: apiKey});
});

test('GM transport uses application headers without changing credentials', async () => {
  let call;
  globalThis.GM_xmlhttpRequest = options => {call = options; options.onload(json({ok: true}));};
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  await transport.request('bank');
  assert.match(call.headers['User-Agent'], /^TornLendingBank\//);
  assert.equal(call.headers.Authorization, 'Bearer ' + token); assert.equal(call.anonymous, true);
});

test('browser fetch omits forbidden User-Agent and cookies', async t => {
  let options;
  t.mock.method(globalThis, 'fetch', async (_url, value) => {options = value; return new Response('{"ok":true}');});
  const transport = createTransport(origin, {store: memory(saved())}); await transport.request('bank');
  assert.equal(options.headers['User-Agent'], undefined); assert.equal(options.credentials, 'omit');
  assert.equal(options.headers.Authorization, 'Bearer ' + token);
});

test('Cloudflare 1010 gives a safe actionable error and does not retry a write', async () => {
  bridge(); let count = 0;
  globalThis.PDA_httpPost = async () => {count++; return {status: 403, responseText: 'error code: 1010 ' + apiKey};};
  const transport = createTransport(origin, {native: true, store: memory()});
  await assert.rejects(transport.request('link', {key: apiKey}), e => /Cloudflare.*1010/.test(e.message) && !e.message.includes(apiKey));
  assert.equal(count, 1);
});

test('HTML, empty and non-object responses never expose upstream contents', async () => {
  bridge();
  for (const responseText of ['<html>' + apiKey + '</html>', '', 'null', '[]', '42']) {
    globalThis.PDA_httpGet = async () => ({status: 200, responseText});
    const transport = createTransport(origin, {native: true, store: memory()});
    await assert.rejects(transport.request('bank'), e => /HTTP 200, Torn PDA/.test(e.message) && !e.message.includes(apiKey));
  }
});

test('PDA storage is preferred over GM and uses only this bank namespace', async () => {
  const calls = [];
  globalThis.PDA_storage = {get: async (key, fallback) => {calls.push(key); return fallback;}, set: async (key, value) => calls.push([key, value]), delete: async key => calls.push(key)};
  globalThis.GM_getValue = () => {throw Error('must not use GM');};
  const store = createSessionStore(origin, {native: true});
  assert.equal(await store.read(), null); await store.write(saved()); await store.remove();
  assert.equal(calls[0], 'tlb.session.v1:' + origin); assert.equal(calls[1][0], calls[0]); assert.equal(calls[2], calls[0]);
});

test('GM storage persists across adapter recreation and forget removes it', async () => {
  const values = new Map();
  globalThis.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  globalThis.GM_deleteValue = key => values.delete(key);
  const value = saved(); await createSessionStore(origin, {native: true}).write(value);
  const reopened = createSessionStore(origin, {native: true}); assert.deepEqual(await reopened.read(), value);
  await reopened.remove(); assert.equal(await reopened.read(), null);
});

test('local storage fallback separates bank origins', async () => {
  const values = new Map();
  globalThis.localStorage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  const store = createSessionStore(origin), value = saved(); await store.write(value);
  assert.deepEqual(await createSessionStore(origin).read(), value);
  assert.equal(await createSessionStore('https://other-bank.workers.dev').read(), null);
  await store.remove(); assert.equal(values.size, 0);
});

test('custom key links request only the bank endpoints and separate lender trade access', () => {
  for (const role of ['Borrower', 'Lender']) {
    const url = new URL(customKeyLink(role));
    assert.equal(url.origin, 'https://www.torn.com'); assert.equal(url.pathname, '/preferences.php');
    const params = new URLSearchParams(url.hash.split('?')[1]);
    assert.equal(params.get('step'), 'addNewKey'); assert.equal(params.get('title'), 'Torn Lending Bank ' + role);
    assert.equal(params.get('user'), 'basic,profile,personalstats,job' + (role === 'Lender' ? ',trades,trade,money' : ''));
    assert.equal(params.has('type'), false); assert.equal(params.has('key'), false);
  }
});

test('a missing PDA response is captured without losing an existing bank session', async () => {
  bridge(); let requests = 0;
  globalThis.PDA_httpGet = async () => {requests++; return undefined;};
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  await assert.rejects(transport.request('bank'), /HTTP 0/);
  const report = transport.diagnostics();
  assert.equal(report.sessionActive, true); assert.equal(report.remembered, true);
  assert.equal(report.recentRequests[0].outcome, 'missing_http_status');
  assert.equal(report.recentRequests[0].responseType, 'undefined');
  assert.equal(report.recentRequests[0].status, null);
  assert.equal(requests, 1); // Copying diagnostics sends no request and retries no save.
  assert.ok(!JSON.stringify(report).includes(token));
});

test('login diagnostics contain neither the entered key nor the returned token', async () => {
  bridge(); const transport = createTransport(origin, {native: true, store: memory()});
  await transport.request('link', {key: apiKey}, {remember: true});
  const report = transport.diagnostics();
  assert.equal(report.recentRequests[0].operation, 'link');
  assert.equal(report.recentRequests[0].outcome, 'ok');
  assert.ok(!JSON.stringify(report).includes(apiKey)); assert.ok(!JSON.stringify(report).includes(token));
});

test('network diagnostics never include the underlying exception message', async () => {
  bridge(); globalThis.PDA_httpGet = async () => {throw Error('SENSITIVE_NETWORK_DETAIL');};
  const transport = createTransport(origin, {native: true, store: memory()});
  await assert.rejects(transport.request('bank'), /Connection interrupted/);
  assert.equal(transport.diagnostics().recentRequests[0].outcome, 'network_error');
  assert.ok(!JSON.stringify(transport.diagnostics()).includes('SENSITIVE_NETWORK_DETAIL'));
});

function delayedResponse() {
  let start, finish;
  const started = new Promise(resolve => {start = resolve;});
  const response = new Promise(resolve => {finish = resolve;});
  return {started, finish, send: () => {start(); return response;}};
}

test('overlapping bank refreshes share one native request but later refreshes read fresh data', async () => {
  bridge(); const gate = delayedResponse(); let reads = 0;
  globalThis.PDA_httpGet = () => {reads++; return reads === 1 ? gate.send() : json({revision: 2});};
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  const first = transport.request('bank'); await gate.started;
  const second = transport.request('bank');
  assert.equal(first, second);
  gate.finish(json({revision: 1}));
  assert.deepEqual(await Promise.all([first, second]), [{revision: 1}, {revision: 1}]);
  assert.equal(reads, 1);
  assert.deepEqual(await transport.request('bank'), {revision: 2});
  assert.equal(reads, 2);
  assert.equal(transport.diagnostics().recentRequests.length, 2);
});

test('an undefined shared PDA response clears the pending read so manual retry can succeed', async () => {
  bridge(); const gate = delayedResponse(); let reads = 0;
  globalThis.PDA_httpGet = () => {reads++; return reads === 1 ? gate.send() : json({ok: true});};
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  const first = transport.request('bank'); await gate.started;
  const second = transport.request('bank');
  const results = Promise.allSettled([first, second]); gate.finish(undefined);
  for (const result of await results) {
    assert.equal(result.status, 'rejected'); assert.match(result.reason.message, /HTTP 0/);
  }
  assert.equal(reads, 1); assert.equal(transport.hasSession(), true);
  assert.deepEqual(await transport.request('bank'), {ok: true}); assert.equal(reads, 2);
});

test('writes are never combined and a completed write starts a fresh bank read', async () => {
  const calls = bridge(), old = delayedResponse(), fresh = delayedResponse(); let reads = 0;
  globalThis.PDA_httpGet = () => (++reads === 1 ? old : fresh).send();
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  const beforeWrite = transport.request('bank'); await old.started;
  await Promise.all([transport.request('bank', {action: 'one'}), transport.request('bank', {action: 'two'})]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => JSON.parse(call.body)), [{action: 'one'}, {action: 'two'}]);
  const afterWrite = transport.request('bank'); await fresh.started;
  assert.notEqual(beforeWrite, afterWrite);
  old.finish(json({revision: 1})); await beforeWrite;
  assert.equal(transport.request('bank'), afterWrite); // Old completion cannot evict the new read.
  fresh.finish(json({revision: 2})); assert.deepEqual(await afterWrite, {revision: 2});
  assert.equal(reads, 2);
});

test('a bank read started during a write is not reused after that write completes', async () => {
  bridge(); const write = delayedResponse(), read = delayedResponse(); let reads = 0;
  globalThis.PDA_httpPost = write.send;
  globalThis.PDA_httpGet = () => (++reads === 1 ? read.send() : json({revision: 2}));
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  const mutation = transport.request('check', {key: apiKey, id: '1'}); await write.started;
  const duringWrite = transport.request('bank'); await read.started;
  write.finish(json({ok: true})); await mutation;
  assert.deepEqual(await transport.request('bank'), {revision: 2});
  read.finish(json({revision: 1})); await duringWrite;
  assert.equal(reads, 2);
});

test('clearing a session invalidates a pending read and rejects its old response', async () => {
  bridge(); const gate = delayedResponse(); let reads = 0;
  globalThis.PDA_httpGet = () => (++reads === 1 ? gate.send() : json({ok: true}));
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  const old = transport.request('bank'); await gate.started;
  await transport.clear();
  const next = transport.request('bank'); assert.notEqual(next, old);
  assert.deepEqual(await next, {ok: true});
  gate.finish(json({old: true})); await assert.rejects(old, /login changed/);
  assert.equal(reads, 2); assert.equal(transport.hasSession(), false);
});

test('missing or malformed keys never send live checks and keep the remembered bank login', async () => {
  const calls = bridge(), store = memory(saved());
  const transport = createTransport(origin, {native: true, store});
  for (const path of ['check', 'trades', 'link']) {
    for (const key of [undefined, '', ' ', 'short', 'x'.repeat(17), 'bad_key_00000000!', 1234567890123456]) {
      await assert.rejects(transport.request(path, {key, id: '1'}), /valid 16-character Torn API key/);
    }
  }
  assert.equal(calls.length, 0);
  assert.equal(transport.diagnostics().recentRequests.length, 0);
  assert.equal(transport.hasSession(), true);
  assert.equal(transport.isRemembered(), true);
  assert.equal(store.value().token, token);
  assert.deepEqual(await transport.request('bank'), {ok: true});
  assert.equal(calls.length, 1); // Bank records remain accessible without the Torn key.
});

test('entering a complete key enables account and trade checks without signing in again', async () => {
  const calls = bridge();
  const transport = createTransport(origin, {native: true, store: memory(saved())});
  await assert.rejects(transport.request('check', {key: ''}), /Connections/);
  for (const path of ['check', 'trades']) {
    assert.deepEqual(await transport.request(path, {key: apiKey, id: '1'}), {ok: true});
  }
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/api/check', '/api/trades']);
  for (const call of calls) {
    assert.equal(call.headers.Authorization, 'Bearer ' + token);
    assert.equal(JSON.parse(call.body).key, apiKey);
  }
  assert.ok(!JSON.stringify(transport.diagnostics()).includes(apiKey));
});
