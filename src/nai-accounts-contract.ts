/** Desktop/mobile stable JSON contract v1. Never return passwords, derived keys or tokens.
 * list() -> [{id,label,method:'token'|'official-login'|'relay',apiBaseUrl,imageBaseUrl}]
 * state() -> {selectedId?:string,busy:boolean}
 * select(id?:string) -> {selectedId?:string}; absent id restores preserved legacy configuration.
 * add({label,method,token,apiBaseUrl,imageBaseUrl?}) -> profile (no token).
 * For relay, omitted/blank imageBaseUrl is persisted as the explicit API base; no host guess.
 * login({label,email,password,otp?:string}) -> {ok:true,account:profile} |
 *   {ok:false,code:'otp-unsupported'|'auth'|'network',message:string}.
 * login success saves encrypted accessToken, does not automatically activate.
 * migrate() -> {migrated:boolean,message:string}; copies only exact-official legacy
 * credentials once as legacy-official-v1, preserves original bytes, never auto-activates.
 * remove(id) -> void; current accounts may be removed atomically; the last removal signs out. Leased accounts cannot be removed.
 * probe(id) -> {status:number,subscription:'skipped'|'available',protocol:'unverified',message:string}.
 * probe also returns ok/code: auth, unsupported, network, invalid-input, invalid-response, http, passed.
 * add/login must pass read-only verification before persistence; failure preserves stored accounts.
 * Relay first uses its declared image base + /user/data, matching the legacy verifier.
 * Missing-route 404/405/501 alone permits its declared API base + /user/subscription.
 * Both requests carry the independent relay Key; no anonymous-status gate is required.
 * Successful responses require compatible account data, not merely HTTP 200 or an HTML page.
 * Saved migrated custom-image profiles probe their preserved image host only; no Key or method is rewritten.
 * No redirect or fallback to official/undeclared hosts. Unsupported routes fail explicitly and do not save
 * or invoke paid generation. Official Token and derived-login verification use image.novelai.net/user/data,
 * matching the legacy account reader, with 8s timeout, 256KiB bound and no redirects/retries.
 * IPC names use naiAccounts:<method>; window.naiAccounts exposes corresponding methods.
 * Native mobile must provide equivalent encrypted storage; this contract is not evidence
 * of mobile implementation or runtime DPAPI verification.
 * Passwords stay transient; main only sends {key} to exact HTTPS image.novelai.net/user/login.
 * UI has no editable OTP field. Typed backend OTP or explicit server OTP requirement returns otp-unsupported without inventing
 * a second request; original credentials remain. Raw password is never persisted/sent.
 * Source: github.com/Aedial/novelai-api/blob/main/novelai_api/{utils,_high_level,_low_level}.py
 * Access key: BLAKE2b-128(password first 6 Unicode code points + email +
 * novelai_data_access_key) salt; Argon2id v19 t=2,m=1953KiB,p=1,out=64 bytes;
 * URL-safe base64 first 64 chars. hash-wasm@4.12.0, independent noble fixed vectors.
 * Reference implementation is third-party, not an official login-support guarantee.
 * Selected account token+hosts are bound by root getToken/getSettings and async IPC scope.
 * Selection refuses in-flight native/agent/stream operations; batch binding stops stale
 * between-call submissions. Legacy endpoints/token are also snapshotted per operation.
 * Relay raw paths: /ai/generate-image, /ai/upscale, /ai/augment-image. Disable relay stream
 * preview until capability is verified. Selected-account paid requests never auto-retry.
 * No fallback official host and no redirects when selected. dashboard -> origin only via
 * explicit relay helper: API prefix remains manual. SunAPI login UI alone proves no API.
 * Root settings expose runtime-only naiAccountId and keyed naiAccountRevision (no token).
 * Native agent IPC records new pending proposal account revisions; a saved proposal on
 * another account or an unknown pre-restart proposal is refused, requiring regeneration.
 * Shared asynchronous in-app confirmation releases inert/hit-testing before resolving.
 * Fixed official login/account-data URL honors proxyConfigForUrl(nai, actual URL, settings).
 * Windows safeStorage synthetic round-trip was observed (no real user store).
 * Mobile HANDOFF read-only parity inspection + its four synthetic vectors passed here.
 * Real login, real relay protocol/billing, OTP and signed all-client integration remain untested.
 */
export const NAI_ACCOUNTS_CONTRACT_VERSION = 1 as const;
