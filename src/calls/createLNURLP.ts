import dotenv from 'dotenv';
import { LNURLP } from '../types/lnurlp';
import { dateNow } from '../utils/time';
import { PAYURL } from '../consts/lnbits';

export default async function createLNURLP(
  description: string,
  buyInMin: number,
  buyInMax: number
): Promise<LNURLP | null> {
  dotenv.config();
  const lnbitsURL = process.env.LNBITS_URL;
  const lnbitsKEY = process.env.LNBITS_KEY;
  const lnbitsHook = process.env.LNBITS_DEPOSITHOOK;

  if (!lnbitsURL || !lnbitsKEY || !lnbitsHook) {
    console.error(`${dateNow()} Missing LNbits environment variables`);
    return null;
  }

  try {
    const response = await fetch(lnbitsURL + PAYURL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': lnbitsKEY,
      },
      body: JSON.stringify({
        description: description,
        min: buyInMin,
        max: buyInMax,
        comment_chars: 10,
        webhook_url: lnbitsHook,
      }),
    });

    if (!response.ok) {
      throw new Error(`LNbits responded with status ${response.status}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      lnurlp: data.lnurl,
      description: data.description,
      min: data.min,
    };
  } catch (error) {
    console.error('Failed to create LNURLP link:', error);
    return null;
  }
}
