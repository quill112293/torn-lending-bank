export function parseInviteId(value) {
  const input = String(value ?? '').trim();
  let id = /^\d{1,10}$/.test(input) ? input : input.match(/^(?:[^\[\]\r\n]+\s*)?\[(\d{1,10})\]$/)?.[1];
  if (!id) {
    try {
      const url = new URL(input);
      if (['https:', 'http:'].includes(url.protocol) && ['torn.com', 'www.torn.com'].includes(url.hostname) &&
          !url.username && !url.password && url.pathname === '/profiles.php') id = url.searchParams.get('XID');
    } catch { /* Show the same clear input guidance for all unsupported formats. */ }
  }
  if (!/^\d{1,10}$/.test(id || '') || Number(id) < 1) {
    throw Error('Enter the tester’s numeric Torn ID, Name [ID], or Torn profile link.');
  }
  return String(Number(id));
}
