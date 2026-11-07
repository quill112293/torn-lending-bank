// Store only the short-lived bank session, never a Torn API key.
export function createSessionStore(origin, {native = false} = {}) {
  const key = 'tlb.session.v1:' + new URL(origin).origin;
  if (native && typeof PDA_storage !== 'undefined') {
    return {kind: 'torn-pda', read: () => PDA_storage.get(key, null), write: value => PDA_storage.set(key, value), remove: () => PDA_storage.delete(key)};
  }
  if (native && typeof GM_getValue === 'function' && typeof GM_setValue === 'function' && typeof GM_deleteValue === 'function') {
    return {kind: 'userscript', read: () => GM_getValue(key, null), write: value => GM_setValue(key, value), remove: () => GM_deleteValue(key)};
  }
  return {
    kind: 'browser',
    read: () => JSON.parse(localStorage.getItem(key) || 'null'),
    write: value => localStorage.setItem(key, JSON.stringify(value)),
    remove: () => localStorage.removeItem(key),
  };
}

export function validSession(value, origin, now = Date.now()) {
  return !!value && value.origin === origin && /^[a-f0-9]{64}$/.test(value.token) &&
    Number.isFinite(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + 12 * 60 * 60 * 1000;
}
