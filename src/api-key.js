// Match the bank server's key format check without exposing the key in errors.
export function validTornKey(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9]{16}$/.test(value);
}
