import type { AccountSummary } from '../../src/types';
export type NaiAccountSummary = Omit<AccountSummary, 'hasToken'|'accountId'>;
function finite(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function credits(value: unknown): number | undefined {
  const n=finite(value);return n!==undefined&&n>=0&&Number.isSafeInteger(Math.round(n))?Math.round(n):undefined;
}
/** Same account payload as the legacy image /user/data route; missing is not zero. */
export function parseNaiAccountSummary(data: any): NaiAccountSummary {
  const sub=data?.subscription??data?.information?.subscription??data?.data?.subscription??data?.data?.information?.subscription??data??{};
  const tierLevel=credits(sub.tier),steps=sub.trainingStepsLeft;
  let anlasBalance: number | undefined;
  if(steps&&typeof steps==='object'&&!Array.isArray(steps)){
    const fixed=credits(steps.fixedTrainingStepsLeft),purchased=credits(steps.purchasedTrainingSteps);
    if(fixed!==undefined||purchased!==undefined)anlasBalance=credits((fixed??0)+(purchased??0));
  }else anlasBalance=credits(steps);
  const expiry=finite(sub.expiresAt);let expiresAt:string|undefined;
  if(expiry!==undefined&&expiry>0){const date=new Date(expiry>10_000_000_000?expiry:expiry*1000);if(Number.isFinite(date.getTime()))expiresAt=date.toISOString().slice(0,10);}
  const percent=finite(sub.usage?.percent),seconds=finite(sub.usage?.timeUntilNextPercent);
  const opusUsage=percent!==undefined&&seconds!==undefined?{percent,isNegative:sub.usage.isNegative===true,timeUntilNextPercent:Math.max(0,seconds)}:undefined;
  return {tierName:tierLevel===3?'Opus':tierLevel===2?'Scroll':tierLevel===1?'Tablet':tierLevel===0?'Paper':'未知',tierLevel,anlasBalance,expiresAt,
    hasActiveSubscription:Boolean(sub.active!==false&&tierLevel&&tierLevel>0),opusUsage,opusUsageUpdatedAt:opusUsage?Date.now():undefined};
}
/** Whitelist only stable metadata; no token, raw response or minute-by-minute usage. */
export function stableNaiAccountSummary(value: NaiAccountSummary): NaiAccountSummary {
  return {tierName:typeof value?.tierName==='string'?value.tierName.slice(0,32):undefined,tierLevel:credits(value?.tierLevel),
    anlasBalance:credits(value?.anlasBalance),expiresAt:typeof value?.expiresAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.expiresAt)?value.expiresAt:undefined,
    hasActiveSubscription:value?.hasActiveSubscription===true};
}
