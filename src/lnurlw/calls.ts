import dotenv from 'dotenv';
import { dateNow } from '../utils/time';
import { LNURLW } from '../types/lnurlw';

export async function createLNURLW(
  amount: number,
  maxWithdrawals: number
): Promise<LNURLW | null> {
  dotenv.config();
  const lnbitsURL = process.env.LNBITS_URL;
  const lnbitsKEY = process.env.LNBITS_KEY;
  const lnbitsHook = process.env.LNBITS_DEPOSITHOOK;

  if (!lnbitsURL || !lnbitsKEY || !lnbitsHook) {
    console.error(`${dateNow()} Missing LNbits environment variables`);
    return null;
  }

  const response = await fetch(lnbitsURL + '/withdraw/api/v1/links', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': lnbitsKEY,
    },
    body: JSON.stringify({
      title: 'Chain Duel Prize',
      min_withdrawable: amount,
      max_withdrawable: amount,
      uses: maxWithdrawals,
      wait_time: 1,
      is_unique: false,
      webhook_url: lnbitsHook,
    }),
  });
  if (!response.ok) {
    throw new Error(`LNbits responded with status ${response.status}`);
  }

  const data: LNURLW = await response.json();
  console.log(data);
  return data;
}
