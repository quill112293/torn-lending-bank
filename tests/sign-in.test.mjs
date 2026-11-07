import test from 'node:test';
import assert from 'node:assert/strict';
import {signInAndLoadBank} from '../src/sign-in.js';

const key = 'TestOnlyKey00001';
const bank = {state: {revision: 1}, user: {id: '1'}};

test('sign-in verifies the account then reads the bank exactly once', async () => {
  const calls = [];
  const request = async (path, body, options) => {
    calls.push({path, body, options});
    if (path === 'link') return {id: 1};
    if (path === 'check') return {profile: {id: 1}};
    // Simulate the PDA report: an immediate second bank read has no response.
    if (calls.filter(call => call.path === 'bank').length > 1) throw Error('HTTP 0');
    return bank;
  };
  const result = await signInAndLoadBank(request, key, {remember: true});
  assert.deepEqual(calls.map(call => call.path), ['link', 'check', 'bank']);
  assert.deepEqual(calls[0], {path: 'link', body: {key}, options: {remember: true}});
  assert.deepEqual(calls[1].body, {key, id: '1'});
  assert.equal(calls[2].body, undefined);
  assert.deepEqual(result, {bank, checkResult: {profile: {id: 1}}, checkError: ''});
});

test('an optional account check failure still loads the bank once and preserves its warning', async () => {
  const calls = [];
  const result = await signInAndLoadBank(async path => {
    calls.push(path);
    if (path === 'link') return {id: 1};
    if (path === 'check') throw Error('Account check unavailable');
    return bank;
  }, key);
  assert.deepEqual(calls, ['link', 'check', 'bank']);
  assert.deepEqual(result, {bank, checkResult: null, checkError: 'Account check unavailable'});
});

test('a failed login does not attempt an account check or bank read', async () => {
  const calls = [];
  await assert.rejects(signInAndLoadBank(async path => {
    calls.push(path); throw Error('Sign-in failed');
  }, key), /Sign-in failed/);
  assert.deepEqual(calls, ['link']);
});

test('a failed bank load is reported without automatically retrying it', async () => {
  const calls = [];
  await assert.rejects(signInAndLoadBank(async path => {
    calls.push(path);
    if (path === 'link') return {id: 1};
    if (path === 'check') return {profile: {id: 1}};
    throw Error('Bank unavailable');
  }, key), /Bank unavailable/);
  assert.deepEqual(calls, ['link', 'check', 'bank']);
});
