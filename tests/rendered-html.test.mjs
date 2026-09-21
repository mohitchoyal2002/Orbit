import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env = {};',shortCircuit:true};return next(specifier,context)}});
const {default:worker}=await import('../dist/server/index.js');
const env={ASSETS:{fetch:async()=>new Response('Not found',{status:404})}};
const ctx={waitUntil(){},passThroughOnException(){}};
test('finished website renders meaningful HTML and security headers',async()=>{
 for(const [path,title] of [['/','Less manual.'],['/privacy','Your data.']]){
  const response=await worker.fetch(new Request('http://localhost'+path,{headers:{accept:'text/html'}}),env,ctx);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const html=await response.text();assert.ok(html.includes(title));assert.ok(!html.includes('Starter Project'));assert.ok(!html.includes('name="codex-preview"'));assert.ok(!html.includes('owner@example.test'));
 }
});

test('the scroll story is labelled, readable without JavaScript, and comes before services',async()=>{
 const response=await worker.fetch(new Request('http://localhost/',{headers:{accept:'text/html'}}),env,ctx);
 const html=await response.text();
 const start=html.indexOf('id="proof"');
 const end=html.indexOf('id="solutions"');
 assert.ok(start>-1&&end>start);
 const story=html.slice(start,end);
 for(const text of ['Simulated example','no messages sent','Capture the interest.','Give a useful answer.','Make the next step easy.','Request a demo for my business'])assert.ok(story.includes(text),text);
 for(const tag of story.match(/<video\b[^>]*>/g)||[])assert.ok(!/\ssrc=/.test(tag),'video must not fetch before visibility and motion checks');
});
