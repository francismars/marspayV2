import dotenv from "dotenv";
import { LNURLP } from "../types/lnurlp";
dotenv.config();

export async function createLNURLP(
  description: string,
  buyInMin: number,
  buyInMax: number
): Promise<LNURLP | null> {
  const lnbitsURL = process.env.LNBITS_URL;
  const lnbitsKEY = process.env.LNBITS_KEY;
  const lnbitsHook = process.env.LNBITS_DEPOSITHOOK;

  if (!lnbitsURL || !lnbitsKEY || !lnbitsHook) {
    console.error("Missing LNbits environment variables");
    return null;
  }

  try {
    const response = await fetch(lnbitsURL + "/lnurlp/api/v1/links", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": lnbitsKEY,
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
    console.error("Failed to create LNURLP link:", error);
    return null;
  }
}
