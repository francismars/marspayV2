import { dateNow } from '../../utils/time';

export default async function payInvoice(invoice: string) {
  const lnbitsURL = process.env.LNBITS_URL;
  const lnbitsKEY = process.env.LNBITS_KEY;
  if (!lnbitsURL || !lnbitsKEY) {
    console.error(`${dateNow()} Missing LNbits environment variables`);
    return null;
  }
  const url = lnbitsURL + '/api/v1/payments';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': lnbitsKEY,
    },
    body: JSON.stringify({
      out: true,
      bolt11: invoice,
    }),
  });

  if (!response.ok) {
    return Promise.reject(new Error(response.statusText));
  }
  const data = await response.json();

  return data;
}
