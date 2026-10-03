import { argon2id, blake2b } from 'hash-wasm';
import axios from 'axios';
import { proxyConfigForUrl } from './proxy';
import { getSettings } from './store';
// User authentication is served by the official image API host, like /user/data.
// Keep the destination fixed: a selected relay must never receive derived keys.
const OFFICIAL_LOGIN_URL='https://image.novelai.net/user/login';
export interface OfficialLoginInput { label: string; email: string; password: string; otp?: string }
export type OfficialLoginResult = { ok: true; token: string } | { ok: false; code: 'otp-unsupported' | 'auth' | 'network' | 'challenge' | 'rate-limited' | 'invalid-response'; status?:number; message: string };
// Aedial/novelai-api utils.py: variable-length BLAKE2b, Python Unicode slicing.
export async function deriveNovelAiAccessKey(email: string, password: string): Promise<string> {
  const saltHex = await blake2b(Array.from(password).slice(0, 6).join('') + email + 'novelai_data_access_key', 128);
  const salt = Buffer.from(saltHex, 'hex');
  const bytes = await argon2id({ password, salt, iterations: 2, parallelism: 1, memorySize: 1953, hashLength: 64, outputType: 'binary' });
  try { return Buffer.from(bytes).toString('base64url').slice(0,64); }
  finally { bytes.fill(0); salt.fill(0); }
}
export async function officialNovelAiLogin(input: OfficialLoginInput): Promise<OfficialLoginResult> {
  if (input.otp) return { ok:false, code:'otp-unsupported', message:'OTP 登录协议尚未确认；未发送密码或 OTP。请使用官方 Persistent API Token，已有凭据不变。' };
  if (typeof input.email!=='string' || typeof input.password!=='string' || !input.email || !input.password || input.email.length > 320 || input.password.length > 4096) return { ok:false,code:'auth',message:'邮箱或密码输入无效。' };
  try {
    const settings={...getSettings()};
    const proxy=await proxyConfigForUrl('nai',OFFICIAL_LOGIN_URL,settings);
    const key = await deriveNovelAiAccessKey(input.email, input.password);
    const response = await axios.post(OFFICIAL_LOGIN_URL, { key }, {
      ...proxy,
      timeout: 12000, maxRedirects: 0, maxContentLength: 65536,
      validateStatus: () => true, headers: { 'Content-Type':'application/json' },
    });
    const data=response.data;
    // Fixed categories only. Never pass untrusted response text/credential echoes
    // to the renderer or diagnostic log. Preserve the actual HTTP status.
    const remoteMessage=String(data?.message ?? data?.error ?? '');
    const required=(names:string[])=>names.some(name=>data?.[name]!=null&&data[name]!==false);
    if (required(['otp','otpRequired','mfa','mfaRequired','twoFactorRequired','requiresTwoFactor']) || /otp|two.factor|2fa/i.test(remoteMessage)) return {ok:false,code:'otp-unsupported',status:response.status,message:'官方要求额外验证码；当前 OTP 协议尚未确认，已有账户凭据保留。请改用官方 API Token。'};
    if (response.status===429) return {ok:false,code:'rate-limited',status:429,message:'官方暂时限制登录频率；未重试、未保存账号。'};
    if (required(['challenge','captcha']) || (response.status===403 && typeof data==='string' && /<html|cloudflare|captcha/i.test(data))) return {ok:false,code:'challenge',status:response.status,message:'官方要求网页安全验证；请先在官网完成验证，或使用 API Token。未保存账号。'};
    if (response.status !== 201 && response.status !== 200) return {ok:false,code:'auth',status:response.status,message:`官方拒绝本次登录（HTTP ${response.status}）；请核对官网登录与账号信息，已有凭据不变。`};
    if (typeof data?.accessToken !== 'string' || !data.accessToken || data.accessToken.length > 16384 || !/^[\x21-\x7e]+$/.test(data.accessToken)) return {ok:false,code:'invalid-response',status:response.status,message:'官方登录未返回有效 accessToken；已有凭据不变。'};
    return {ok:true,token:data.accessToken};
  } catch { return {ok:false,code:'network',message:'官方登录请求失败；未重试、未转发至中转、已有凭据不变。'}; }
}
