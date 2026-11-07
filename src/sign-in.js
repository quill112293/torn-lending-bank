// Account enrichment is optional; a successful login must still load the bank.
// Keep the one bank read here so nested account-check UI handlers cannot repeat it.
export async function signInAndLoadBank(request, key, {remember = false} = {}) {
  const linked = await request('link', {key}, {remember});
  let checkResult = null, checkError = '';
  try { checkResult = await request('check', {key, id: String(linked.id)}); }
  catch (error) { checkError = error.message; }
  const bank = await request('bank');
  return {bank, checkResult, checkError};
}
