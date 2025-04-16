export default async function getInvoiceFromCallback(
  callback: string,
  satsAmount: number
) {
  const url = callback + '?amount=' + satsAmount * 1000;
  const response = await fetch(url, {
    method: 'GET',
  });
  if (!response.ok) {
    return Promise.reject(new Error(response.statusText));
  }
  const data = await response.json();

  return data.pr;
}
