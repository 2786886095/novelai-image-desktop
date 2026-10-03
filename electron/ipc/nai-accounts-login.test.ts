import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import http from 'node:http';
import fs from 'node:fs';
const proxyFixture=vi.hoisted(()=>({settings:{proxyMode:'manual',proxyUrl:'http://configured-proxy.invalid:7890',proxyForNai:true,apiBaseUrl:'https://selected-relay.invalid',imageBaseUrl:'https://selected-relay.invalid'},httpAgent:{fixture:'http'},httpsAgent:{fixture:'https'},resolve:vi.fn()}));
vi.mock('./store',()=>({getSettings:()=>proxyFixture.settings}));
vi.mock('./proxy',()=>({proxyConfigForUrl:(...args:unknown[])=>{proxyFixture.resolve(...args);return Promise.resolve({proxy:false,httpAgent:proxyFixture.httpAgent,httpsAgent:proxyFixture.httpsAgent});}}));
import { deriveNovelAiAccessKey, officialNovelAiLogin } from './nai-accounts-login';
const key='PDlYfmFO5NKm1QKszD4ivqZONVkfOylv5uNuaWZrMaU5P_3Sb4Rw7cLfU1sLZJW9';
const input={label:'fixture',email:'fixture@example.invalid',password:'synthetic-password'};
afterEach(()=>{vi.restoreAllMocks();proxyFixture.resolve.mockClear();});
describe('official login synthetic fixtures',()=>{
 it('matches all four shared mobile reference vectors read-only',async()=>{const vectors=JSON.parse(fs.readFileSync('mobile/test/accounttests/fixtures/access-key-vectors.json','utf8'));for(const v of vectors)expect(await deriveNovelAiAccessKey(v.email,v.password)).toBe(v.accessKey);});
 it('wires configured NovelAI proxy to fixed official URL even while relay selected',async()=>{const spy=vi.spyOn(axios,'post').mockResolvedValue({status:201,data:{accessToken:'synthetic-token'}});expect(await officialNovelAiLogin(input)).toMatchObject({ok:true});expect(proxyFixture.resolve).toHaveBeenCalledWith('nai','https://image.novelai.net/user/login',proxyFixture.settings);expect(spy).toHaveBeenCalledWith('https://image.novelai.net/user/login',{key},expect.objectContaining({proxy:false,httpAgent:proxyFixture.httpAgent,httpsAgent:proxyFixture.httpsAgent,maxRedirects:0}));expect(spy).toHaveBeenCalledTimes(1);});
 it('matches independent noble Argon2id v19 + variable BLAKE2b fixed vector',async()=>{expect(await deriveNovelAiAccessKey(input.email,input.password)).toBe(key);});
 it('matches Python Unicode code-point slicing vector',async()=>{expect(await deriveNovelAiAccessKey('unicode@example.invalid','😀😁😂😃😄😅abcdef')).toBe('I7BKjed6wXwraYfv0MJMomAbTuJwEhil9anMqT8-PBs1fKB2mk6fmHJsbKia74ca');});
 it('sends exact derived key only to allowlisted URL; local HTTP fixture returns token',async()=>{
  let body='';const server=http.createServer((req,res)=>{req.on('data',chunk=>body+=chunk);req.on('end',()=>{res.writeHead(201,{'content-type':'application/json'});res.end(JSON.stringify({accessToken:'fixture-access-token'}));});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};const client=axios.create();
  const spy=vi.spyOn(axios,'post').mockImplementation(async(url,data,config)=>{expect(url).toBe('https://image.novelai.net/user/login');expect(data).toEqual({key});expect(config?.maxRedirects).toBe(0);return client.post(`http://127.0.0.1:${address.port}/user/login`,data,{proxy:false,maxRedirects:0});});
  try{expect(await officialNovelAiLogin(input)).toEqual({ok:true,token:'fixture-access-token'});expect(spy).toHaveBeenCalledTimes(1);expect(JSON.parse(body)).toEqual({key});expect(body).not.toContain(input.password);expect(body).not.toContain(input.email);}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 });
 it('rejects supplied OTP without any transmission',async()=>{const spy=vi.spyOn(axios,'post');expect((await officialNovelAiLogin({...input,otp:'123456'})).ok).toBe(false);expect(spy).not.toHaveBeenCalled();});
 it('reports server OTP requirement without inventing a follow-up protocol',async()=>{const spy=vi.spyOn(axios,'post').mockResolvedValue({status:401,data:{otpRequired:true}});expect(await officialNovelAiLogin(input)).toMatchObject({ok:false,code:'otp-unsupported'});expect(spy).toHaveBeenCalledTimes(1);});
 it('no token on auth rejection or redirect; never retries',async()=>{const spy=vi.spyOn(axios,'post').mockResolvedValue({status:302,data:{}});expect(await officialNovelAiLogin(input)).toMatchObject({ok:false,code:'auth'});expect(spy).toHaveBeenCalledTimes(1);});
 it.each([
  [400,{error:'Incorrect Login Key; untrusted echoed credential'},'auth'],
  [429,{error:'remote rate limit payload'},'rate-limited'],
  [403,'<html>Cloudflare captcha; untrusted echoed credential</html>','challenge'],
  [200,{challenge:'untrusted challenge secret'},'challenge'],
  [200,{otpRequired:true},'otp-unsupported'],
  [200,{requiresTwoFactor:true,accessToken:'synthetic-token'},'otp-unsupported'],
  [200,{accessToken:'bad\nheader'},'invalid-response'],
  [201,{},'invalid-response'],
 ] as const)('preserves actual HTTP %s with bounded safe category',async(status,data,code)=>{
  const spy=vi.spyOn(axios,'post').mockResolvedValue({status,data});
  const result=await officialNovelAiLogin(input);
  expect(result).toMatchObject({ok:false,code,status});
  expect(JSON.stringify(result)).not.toMatch(/untrusted|remote rate|bad\\nheader/);
  expect(spy).toHaveBeenCalledTimes(1);
 });
 it('false challenge/OTP flags do not block a valid response',async()=>{
  vi.spyOn(axios,'post').mockResolvedValue({status:201,data:{accessToken:'synthetic-token',challenge:false,captcha:false,otpRequired:false,mfa:false}});
  expect(await officialNovelAiLogin(input)).toEqual({ok:true,token:'synthetic-token'});
 });
});
