import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';

// Execute the real route handlers and real SQLite migrations. Only platform
// identity headers and Cloudflare binding delivery are adapted for Node.
const sqlite = new DatabaseSync(':memory:');
for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql'))) sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
function prepare(sql) {
 let values = [];
 return {
  bind(...args) { values = args; return this; },
  async first() { return sqlite.prepare(sql).get(...values) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
  async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
 };
}
const database = {
 prepare,
 async batch(statements) {
  sqlite.exec('BEGIN');
  try {
   const results = [];
   for (const statement of statements) results.push(await statement.all());
   sqlite.exec('COMMIT');
   return results;
  } catch(error) {
   sqlite.exec('ROLLBACK');
   throw error;
  }
 }
};
globalThis.__orbitTestEnv = { DB: database, ORBIT_RATE_LIMIT_SALT: 'test-only-salt-never-used-in-production', ORBIT_ADMIN_EMAIL: 'owner@example.test' };
globalThis.__orbitTestHeaders = new Headers();
const result = await build({ stdin: { contents: 'export * as enquiry from "./app/api/enquiries/route.ts"; export * as studio from "./app/api/studio/enquiries/route.ts";', resolveDir: new URL('..', import.meta.url).pathname }, bundle: true, write: false, format: 'esm', platform: 'node', target: 'node24', plugins: [{ name:'platform-test-adapter', setup(build) {
 build.onResolve({filter:/^(cloudflare:workers|next\/headers|next\/navigation)$/}, args => ({path:args.path,namespace:'platform-test'}));
 build.onLoad({filter:/.*/,namespace:'platform-test'}, args => ({contents:args.path==='cloudflare:workers'?'export const env=globalThis.__orbitTestEnv;':args.path==='next/headers'?'export async function headers(){return globalThis.__orbitTestHeaders;}':'export function redirect(){throw new Error("Unexpected redirect in API handler");}',loader:'js'}));
} }] });
const routes = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const valid = () => ({name:'Test Owner', email:'TEST@EXAMPLE.TEST', company:'Test Studio', message:'We need help following up website enquiries.', goal:'Lead follow-up', plan:'Launch', requestId:crypto.randomUUID(), startedAt:Date.now()-5000, website:''});
const request = (data, overrides={}) => new Request('https://orbit.example.test/api/enquiries',{method:'POST',headers:{'content-type':'application/json','origin':'https://orbit.example.test','cf-connecting-ip':'192.0.2.1',...overrides},body:JSON.stringify(data)});
const admin = () => { globalThis.__orbitTestHeaders=new Headers({'oai-authenticated-user-email':'owner@example.test','oai-authenticated-user-id':'owner-test-id'}); };
const reset = () => { sqlite.exec('DELETE FROM enquiries; DELETE FROM rate_limits;'); globalThis.__orbitTestHeaders=new Headers();globalThis.__orbitTestEnv.DB=database; };

test('production enquiry flow and owner authorization', async t => {
 await t.test('valid enquiry persists normalized contact and returns a reference', async()=>{ reset();const input=valid();const response=await routes.enquiry.POST(request(input));assert.equal(response.status,201);const data=await response.json();assert.match(data.reference,/^ORB-[0-9A-F]{12}$/);const saved=sqlite.prepare('SELECT * FROM enquiries').get();assert.equal(saved.email,'test@example.test');assert.equal(saved.status,'new');assert.equal(saved.message,input.message);assert.equal(saved.reference,data.reference); });
 await t.test('retrying the same request is idempotent',async()=>{reset();const input=valid();const a=await routes.enquiry.POST(request(input));const b=await routes.enquiry.POST(request(input));assert.deepEqual(await a.json(),await b.json());assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,1);const collision=await routes.enquiry.POST(request({...input,company:'Different company'}));assert.equal(collision.status,409);});
 await t.test('invalid data, too-fast submissions and honeypot never persist',async()=>{reset();for(const patch of [{email:'bad-address'},{message:'short'},{name:' '},{plan:'Untrusted plan'},{website:'spam.test'},{startedAt:Date.now()+10000}]){const response=await routes.enquiry.POST(request({...valid(),...patch}));assert.equal(response.status,400)}assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,0);});
 await t.test('cross-site and oversized payloads are rejected',async()=>{reset();assert.equal((await routes.enquiry.POST(request(valid(),{origin:'https://attacker.example'}))).status,403);assert.equal((await routes.enquiry.POST(request(valid(),{'sec-fetch-site':'cross-site'}))).status,403);assert.equal((await routes.enquiry.POST(request({...valid(),message:'x'.repeat(17000)}))).status,413);const invalid=new Request('https://orbit.example.test/api/enquiries',{method:'POST',headers:{'content-type':'text/plain'},body:'oops'});assert.equal((await routes.enquiry.POST(invalid)).status,415);});
 await t.test('persistent rate limits stop a sixth new submission',async()=>{reset();for(let i=0;i<5;i++)assert.equal((await routes.enquiry.POST(request(valid()))).status,201);const response=await routes.enquiry.POST(request(valid()));assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'600');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,5);const key=sqlite.prepare('SELECT key FROM rate_limits').get().key;assert.match(key,/^[0-9a-f]{64}$/);assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM enquiries').all()).includes('192.0.2.1'));});
 await t.test('public callers and non-owner identities cannot read or mutate leads',async()=>{reset();const input=valid();await routes.enquiry.POST(request(input));for(const email of ['', 'other@example.test']){globalThis.__orbitTestHeaders=new Headers(email?{'oai-authenticated-user-email':email}:{});assert.equal((await routes.studio.GET(new Request('https://orbit.example.test/api/studio/enquiries'))).status,403);const mutation=new Request('https://orbit.example.test/api/studio/enquiries',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:input.requestId,status:'closed'})});assert.equal((await routes.studio.PATCH(mutation)).status,403)}assert.equal(sqlite.prepare('SELECT status FROM enquiries').get().status,'new');});
 await t.test('owner can list, filter, update and delete an enquiry',async()=>{reset();const input=valid();await routes.enquiry.POST(request(input));admin();const listing=await routes.studio.GET(new Request('https://orbit.example.test/api/studio/enquiries'));assert.equal(listing.status,200);assert.equal(listing.headers.get('cache-control'),'private, no-store');assert.equal((await listing.json()).items.length,1);const mutate=(method,body)=>new Request('https://orbit.example.test/api/studio/enquiries',{method,headers:{'content-type':'application/json',origin:'https://orbit.example.test'},body:JSON.stringify(body)});assert.equal((await routes.studio.PATCH(mutate('PATCH',{id:input.requestId,status:'contacted'}))).status,200);assert.equal(sqlite.prepare('SELECT status FROM enquiries').get().status,'contacted');const filtered=await routes.studio.GET(new Request('https://orbit.example.test/api/studio/enquiries?status=new'));assert.equal((await filtered.json()).items.length,0);assert.equal((await routes.studio.DELETE(mutate('DELETE',{id:input.requestId}))).status,200);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,0);});
 await t.test('database errors fail clearly without returning false success',async()=>{reset();globalThis.__orbitTestEnv.DB={prepare(){throw new Error('Simulated database outage')}};const response=await routes.enquiry.POST(request(valid()));assert.equal(response.status,503);assert.match((await response.json()).error,/temporarily unavailable/);globalThis.__orbitTestEnv.DB=database;});
});
