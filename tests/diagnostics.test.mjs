import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestLog, responseMetadata} from '../src/diagnostics.js';

test('diagnostics distinguish missing native response, missing status, zero status and serialized response', () => {
  assert.equal(responseMetadata(undefined).responseType, 'undefined');
  assert.equal(responseMetadata(null).responseType, 'null');
  assert.equal(responseMetadata({}).status, null);
  assert.equal(responseMetadata({status: 0}).status, 0);
  assert.equal(responseMetadata({status: '200'}).status, 200);
  assert.equal(responseMetadata('{"status":200,"responseText":"{}"}').responseType, 'string');
  assert.equal(responseMetadata({statusCode: 200, body: '{}'}).alternateFieldTypes.statusCode, 'number');
});

test('diagnostics never include bodies, secrets, headers, query strings, IDs or custom property names', () => {
  const secret = 'FAKE_SECRET_TEST', log = createRequestLog();
  const record = log.start('market?id=PRIVATE_ID&key=' + secret, 'POST');
  record('Torn PDA', 'http_error', {status: 400, responseText: JSON.stringify({key: secret, loan: 'PRIVATE_LOAN'}),
    responseHeaders: 'Authorization: Bearer ' + secret, error: secret, body: secret, data: {key: secret}, [secret]: true});
  const result = JSON.stringify(log.snapshot());
  for (const privateValue of [secret, 'PRIVATE_ID', 'PRIVATE_LOAN', 'Authorization', '?id=', 'key=']) assert.ok(!result.includes(privateValue));
  assert.equal(log.snapshot()[0].operation, 'market');
  assert.equal(log.snapshot()[0].alternateFieldTypes.data, 'object');
});

test('malformed status text and unknown endpoint names are not copied', () => {
  const log = createRequestLog();
  log.start('SECRET_PATH', 'GET')('Torn PDA', 'missing_http_status', {status: 'SECRET_STATUS'});
  const entry = log.snapshot()[0];
  assert.equal(entry.operation, 'other'); assert.equal(entry.status, null);
  assert.ok(!JSON.stringify(entry).includes('SECRET'));
});

test('diagnostic history is bounded and each request is recorded once', () => {
  const log = createRequestLog(16);
  for (let i = 0; i < 20; i++) {const finish = log.start('bank', 'GET'); finish('browser', 'ok', {status: 200, responseText: '{}'}); finish('browser', 'http_error', {});}
  const entries = log.snapshot();
  assert.equal(entries.length, 16); assert.equal(entries[0].id, 5); assert.equal(entries.at(-1).id, 20);
  assert.ok(entries.every(entry => entry.outcome === 'ok'));
  entries[0].alternateFieldTypes.error = 'tampered';
  assert.equal(log.snapshot()[0].alternateFieldTypes.error, 'undefined');
});
