import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInviteId} from '../src/invite-id.js';

test('invites accept pasted numeric IDs with surrounding whitespace', () => {
  for (const value of ['1234567', ' 1234567 ', '\n1234567\n', '001234567']) {
    assert.equal(parseInviteId(value), '1234567');
  }
});

test('invites accept a copied Torn name with its bracketed ID', () => {
  for (const value of ['Tester [1234567]', '[1234567]', 'Tester_22 [1234567]']) {
    assert.equal(parseInviteId(value), '1234567');
  }
});

test('invites accept Torn profile links and use only their XID', () => {
  for (const value of ['https://www.torn.com/profiles.php?XID=1234567', 'https://torn.com/profiles.php?XID=1234567#profile', 'http://www.torn.com/profiles.php?XID=1234567']) {
    assert.equal(parseInviteId(value), '1234567');
  }
});

test('unsupported or ambiguous invite input gives actionable guidance instead of guessing an ID', () => {
  for (const value of ['', 'Tester', '0', '0000', '-1234567', '12345678901', '12 34', 'Tester [123] Other [456]',
    'https://not-torn.example/profiles.php?XID=1234567', 'https://torn.com.evil.example/profiles.php?XID=1234567',
    'https://www.torn.com/preferences.php?XID=1234567', 'https://www.torn.com/profiles.php?XID=0',
    'https://www.torn.com/profiles.php?XID=abc', 'https://user:password@www.torn.com/profiles.php?XID=1234567']) {
    assert.throws(() => parseInviteId(value), /numeric Torn ID, Name \[ID\], or Torn profile link/);
  }
});
