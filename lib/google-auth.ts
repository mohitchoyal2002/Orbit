import { database, runtimeConfig } from "@/db/connection";
import { safeReturnPath } from "./auth-paths";

const SESSION_COOKIE = "__Host-orbitflow_session", FLOW_COOKIE = "__Host-orbitflow_oauth", MAX_SESSION = 7 * 86400000;
const origins = new Set(["https://admin.orbitflow.work", "https://app.orbitflow.work", "https://www.orbitflow.work", "https://orbit-automation-studio.mohitchoyal2002.chatgpt.site"]);
const bytes = (v:string) => new TextEncoder().encode(v);
const b64 = (v:Uint8Array) => btoa(String.fromCharCode(...v)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const decode = (v:string) => Uint8Array.from(atob(v.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function digest(v:string) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes(v)))); }
export function googleConfigured() {const e=runtimeConfig();return Boolean(e.ORBIT_GOOGLE_CLIENT_ID?.endsWith(".apps.googleusercontent.com") && e.ORBIT_GOOGLE_CLIENT_SECRET && e.ORBIT_RATE_LIMIT_SALT);}
export function readAuthCookie(headers:Headers,name:string) {
  const pairs=(headers.get("cookie")||"").split(";").map(s=>s.trim()).filter(s=>s.startsWith(name+"="));
  if(pairs.length!==1)return "";
  const v=pairs[0].slice(name.length+1);return /^[A-Za-z0-9_-]{43}$/.test(v)?v:"";
}
const cookie=(name:string,value:string,maxAge:number)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function response(location:string,cookies:string[]=[]) {
  const h=new Headers({Location:location,"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer"});
  cookies.forEach(c=>h.append("Set-Cookie",c));return new Response(null,{status:303,headers:h});
}
function trustedOrigin(request:Request) {const o=new URL(request.url).origin;if(!origins.has(o))throw Error("Unsupported login origin");return o;}
async function rateLimit(request:Request,origin:string) {
  const now=Date.now(),salt=runtimeConfig().ORBIT_RATE_LIMIT_SALT;
  const key=await digest(`google-login:${salt}:${origin}:${request.headers.get("cf-connecting-ip")||"unknown"}:${Math.floor(now/3600000)}`);
  const row=await database().prepare("INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits").bind(key,now+3600000).first<{hits:number}>();
  if(!row||row.hits>30)throw Error("Please try again later");
}
export async function purgeExpiredAuth() {
  const db=database(),now=Date.now();
  await db.batch([db.prepare("DELETE FROM google_auth_flows WHERE id IN (SELECT id FROM google_auth_flows WHERE expires_at<=? LIMIT 500)").bind(now),db.prepare("DELETE FROM google_auth_sessions WHERE id IN (SELECT id FROM google_auth_sessions WHERE expires_at<=? LIMIT 500)").bind(now)]);
}
export async function startGoogle(request:Request) {
  if(!googleConfigured())return response("/login?error=google-unavailable");
  try {
    const origin=trustedOrigin(request);await rateLimit(request,origin);await purgeExpiredAuth();
    const state=random(),browser=random(),verifier=random(),nonce=random();
    const returnPath=safeReturnPath(new URL(request.url).searchParams.get("return_to"));
    await database().prepare("INSERT INTO google_auth_flows(id,browser_hash,verifier,nonce,origin,return_path,expires_at) VALUES(?,?,?,?,?,?,?)").bind(await digest(state),await digest(browser),verifier,nonce,origin,returnPath,Date.now()+600000).run();
    const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search=new URLSearchParams({client_id:runtimeConfig().ORBIT_GOOGLE_CLIENT_ID!,redirect_uri:origin+"/api/auth/google/callback",response_type:"code",scope:"openid email profile",state,nonce,code_challenge:await digest(verifier),code_challenge_method:"S256",prompt:"select_account",access_type:"online"}).toString();
    return response(url.toString(),[cookie(FLOW_COOKIE,browser,600)]);
  }catch{return response("/login?error=try-again");}
}

type GoogleJwk = JsonWebKey & {kid:string};
let keys:{values:GoogleJwk[];expires:number}|null=null;
async function googleKeys(fetcher:typeof fetch) {
  if(keys&&keys.expires>Date.now())return keys.values;
  const r=await fetcher("https://www.googleapis.com/oauth2/v3/certs",{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error("Signing keys unavailable");
  const body=await r.json() as {keys:GoogleJwk[]};if(!Array.isArray(body.keys)||!body.keys.length)throw Error("Invalid keys");
  keys={values:body.keys.slice(0,10),expires:Date.now()+300000};return keys.values;
}
export async function verifyGoogleIdToken(token:string,nonce:string,clientId:string,fetcher:typeof fetch=fetch) {
  if(typeof token!=="string"||token.length>16000)throw Error("Invalid identity");
  const parts=token.split(".");if(parts.length!==3)throw Error("Invalid identity");
  const head=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if(head.alg!=="RS256"||typeof head.kid!=="string")throw Error("Invalid identity");
  let key=(await googleKeys(fetcher)).find(k=>k.kid===head.kid&&k.kty==="RSA"&&(!k.use||k.use==="sig"));
  if(!key){keys=null;key=(await googleKeys(fetcher)).find(k=>k.kid===head.kid&&k.kty==="RSA"&&(!k.use||k.use==="sig"));}
  if(!key)throw Error("Unknown signing key");
  const publicKey=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",publicKey,decode(parts[2]),bytes(parts[0]+"."+parts[1])))throw Error("Invalid signature");
  const c=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Math.floor(Date.now()/1000);
  if(!["https://accounts.google.com","accounts.google.com"].includes(c.iss)||c.nonce!==nonce||!nonce)throw Error("Invalid issuer or nonce");
  const audience=typeof c.aud==="string"?[c.aud]:c.aud;
  if(!Array.isArray(audience)||!audience.includes(clientId)||(audience.length>1&&c.azp!==clientId)||(c.azp&&c.azp!==clientId))throw Error("Wrong audience");
  if(!Number.isInteger(c.exp)||c.exp<=now||!Number.isInteger(c.iat)||c.iat>now+60||c.iat<now-600||c.exp<=c.iat)throw Error("Expired identity");
  if(typeof c.sub!=="string"||!c.sub.length||c.sub.length>255||!/^[\x21-\x7e]+$/.test(c.sub)||c.email_verified!==true||typeof c.email!=="string"||c.email.length>254||!/^\S+@\S+\.\S+$/.test(c.email))throw Error("Verified email required");
  // Google must be authoritative for an email used to claim an invite or owner access.
  if(!c.email.toLowerCase().endsWith("@gmail.com")&&!(typeof c.hd==="string"&&c.hd.length))throw Error("Use Gmail or a Google Workspace account");
  const name=typeof c.name==="string"?c.name.slice(0,160):null;
  return {id:`google:${c.sub}`,email:c.email.toLowerCase(),fullName:name,displayName:name||c.email};
}
export async function finishGoogle(request:Request,fetcher:typeof fetch=fetch) {
  const clear=cookie(FLOW_COOKIE,"",0);
  if(!googleConfigured())return response("/login?error=google-unavailable",[clear]);
  try {
    const origin=trustedOrigin(request),url=new URL(request.url),state=url.searchParams.get("state")||"",browser=readAuthCookie(request.headers,FLOW_COOKIE);
    if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!browser)throw Error("Invalid sign-in state");
    // Atomic consumption prevents simultaneous callbacks and replay.
    const flow=await database().prepare("DELETE FROM google_auth_flows WHERE id=? AND browser_hash=? AND origin=? AND expires_at>? RETURNING *").bind(await digest(state),await digest(browser),origin,Date.now()).first<{verifier:string;nonce:string;return_path:string}>();
    if(!flow)throw Error("Expired sign-in state");
    if(url.searchParams.has("error"))return response("/login?error=cancelled",[clear]);
    if(url.searchParams.has("iss")&&url.searchParams.get("iss")!=="https://accounts.google.com")throw Error("Unexpected issuer");
    const code=url.searchParams.get("code");if(!code||code.length>4000)throw Error("Missing authorization code");
    const e=runtimeConfig();
    const r=await fetcher("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:e.ORBIT_GOOGLE_CLIENT_ID!,client_secret:e.ORBIT_GOOGLE_CLIENT_SECRET!,code,grant_type:"authorization_code",redirect_uri:origin+"/api/auth/google/callback",code_verifier:flow.verifier}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error("Exchange failed");
    const tokens=await r.json() as {id_token:string};const user=await verifyGoogleIdToken(tokens.id_token,flow.nonce,e.ORBIT_GOOGLE_CLIENT_ID!,fetcher);
    const session=random(),db=database(),old=readAuthCookie(request.headers,SESSION_COOKIE);
    await db.batch([db.prepare("DELETE FROM google_auth_sessions WHERE id=?").bind(await digest(old)),db.prepare("INSERT INTO google_auth_sessions(id,user_id,email,full_name,origin,created_at,expires_at) VALUES(?,?,?,?,?,?,?)").bind(await digest(session),user.id,user.email,user.fullName,origin,Date.now(),Date.now()+MAX_SESSION)]);
    // Provider access/refresh tokens are neither stored nor exposed to the browser.
    return response(safeReturnPath(flow.return_path),[clear,cookie(SESSION_COOKIE,session,MAX_SESSION/1000)]);
  }catch{return response("/login?error=try-again",[clear]);}
}
export async function googleUser(headers:Headers) {
  const raw=readAuthCookie(headers,SESSION_COOKIE);if(!raw||!googleConfigured())return null;
  const origin="https://"+headers.get("x-orbit-site-host");if(!origins.has(origin))return null;
  const row=await database().prepare("SELECT user_id,email,full_name FROM google_auth_sessions WHERE id=? AND origin=? AND expires_at>?").bind(await digest(raw),origin,Date.now()).first<{user_id:string;email:string;full_name:string|null}>();
  return row?{id:row.user_id,email:row.email,fullName:row.full_name,displayName:row.full_name||row.email}:null;
}
export async function signOutGoogle(request:Request) {
  const origin=trustedOrigin(request);
  if(request.headers.get("origin")!==origin)return new Response("Please sign out from your workspace.",{status:403});
  const raw=readAuthCookie(request.headers,SESSION_COOKIE);
  if(raw)await database().prepare("DELETE FROM google_auth_sessions WHERE id=? AND origin=?").bind(await digest(raw),origin).run();
  return response("/signout-with-chatgpt?return_to=%2Fsigned-out",[cookie(SESSION_COOKIE,"",0),cookie(FLOW_COOKIE,"",0)]);
}
