export function customKeyLink(role = 'Borrower') {
  const lender = role === 'Lender';
  const selections = ['basic', 'profile', 'personalstats', 'job'];
  if (lender) selections.push('trades', 'trade', 'money');
  return 'https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=' +
    encodeURIComponent('Torn Lending Bank ' + (lender ? 'Lender' : 'Borrower')) + '&user=' + selections.join(',');
}
