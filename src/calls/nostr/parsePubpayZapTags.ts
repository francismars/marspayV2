/** Pubpay-style Kind1 tags: `t=pubpay`, `zap-min` / `zap-max` in millisats, `zap-uses`. */
export function parsePubpayZapTags(tags: string[][]): {
  isPubpay: boolean;
  zapMinSats?: number;
  zapMaxSats?: number;
  zapUses?: string;
} {
  const isPubpay = tags.some((t) => t[0] === 't' && t[1] === 'pubpay');
  const zapMin = tags.find((t) => t[0] === 'zap-min')?.[1];
  const zapMax = tags.find((t) => t[0] === 'zap-max')?.[1];
  const zapUses = tags.find((t) => t[0] === 'zap-uses')?.[1];
  return {
    isPubpay,
    zapMinSats: zapMin ? Math.floor(parseInt(zapMin, 10) / 1000) : undefined,
    zapMaxSats: zapMax ? Math.floor(parseInt(zapMax, 10) / 1000) : undefined,
    zapUses,
  };
}
