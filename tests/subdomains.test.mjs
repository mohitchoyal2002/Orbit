import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export const env = {ORBIT_ADMIN_EMAIL:"owner@example.test"};',
    shortCircuit: true,
  };
  return next(specifier, context);
}});
const { default: worker } = await import('../dist/server/index.js');
const env = { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const owner = { 'oai-authenticated-user-email': 'owner@example.test', 'oai-authenticated-user-id': 'owner-test-id' };
const client = { 'oai-authenticated-user-email': 'client@example.test', 'oai-authenticated-user-id': 'client-test-id' };
const request = (host, path = '/', headers = {}, options = {}) => worker.fetch(new Request('https://' + host + path, { ...options, headers: { accept: 'text/html', ...headers } }), env, ctx);
const privateResponse = response => {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
};

test('marketing lives on www and the apex preserves campaign parameters when redirecting', async () => {
  const redirect = await request('orbitflow.work', '/?utm_source=launch');
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get('location'), 'https://www.orbitflow.work/?utm_source=launch');
  const response = await request('www.orbitflow.work');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="hero-title"/);
  assert.match(html, /href="https:\/\/app\.orbitflow\.work"/);
  assert.match(html, /rel="canonical"[^>]*www\.orbitflow\.work/);
});

test('both workspace roots require sign-in with a relative return to their own root', async () => {
  for (const host of ['admin.orbitflow.work', 'app.orbitflow.work']) {
    const response = await request(host);
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get('location'), 'https://' + host);
    assert.equal(location.hostname, host);
    assert.equal(location.pathname, '/login');
    assert.equal(location.searchParams.get('return_to'), '/');
    privateResponse(response);
  }
});

test('the admin root renders the owner inbox and rejects a client identity', async () => {
  const response = await request('admin.orbitflow.work', '/', owner);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Project enquiries/);
  assert.match(html, /href="\/portal"/);
  assert.match(html, /href="https:\/\/www\.orbitflow\.work"/);
  assert.doesNotMatch(html, /id="hero-title"/);
  privateResponse(response);
  for (const path of ['/', '/portal']) {
    const forbidden = await request('admin.orbitflow.work', path, client);
    assert.match(await forbidden.text(), /available only to the studio owner/);
    privateResponse(forbidden);
  }
});

test('the app root renders the client dashboard without a marketing hero', async () => {
  const response = await request('app.orbitflow.work', '/', client);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Client operations/);
  assert.match(html, /href="\/logout"/);
  assert.doesNotMatch(html, /id="hero-title"/);
  privateResponse(response);
});

test('AI calling requires sign-in and keeps its rendered workspace private',async()=>{
  const signedOut=await request('app.orbitflow.work','/calling');
  assert.equal(signedOut.status,307);
  assert.equal(new URL(signedOut.headers.get('location'),'https://app.orbitflow.work').searchParams.get('return_to'),'/calling');
  privateResponse(signedOut);
  const signedIn=await request('app.orbitflow.work','/calling',client);
  assert.equal(signedIn.status,200);
  assert.match(await signedIn.text(),/AI calling/);
  privateResponse(signedIn);
});

test('signed-out pages stay accessible and private routes cannot be selected by a spoofed host header', async () => {
  const signedOut = await request('app.orbitflow.work', '/signed-out');
  assert.equal(signedOut.status, 200);
  assert.match(await signedOut.text(), /signed out/);
  privateResponse(signedOut);
  const spoof = await request('admin.orbitflow.work', '/', { ...client, 'x-orbit-site-host': 'www.orbitflow.work', 'x-forwarded-host': 'www.orbitflow.work' });
  assert.match(await spoof.text(), /available only to the studio owner/);
  const marketing = await request('www.orbitflow.work', '/', { 'x-orbit-site-host': 'admin.orbitflow.work' });
  assert.match(await marketing.text(), /id="hero-title"/);
});

test('subdomain aliases preserve queries and existing path URLs remain usable during DNS setup', async () => {
  for (const [host, path] of [['app.orbitflow.work', '/portal'], ['admin.orbitflow.work', '/studio']]) {
    const response = await request(host, path + '?tab=leads');
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), 'https://' + host + '/?tab=leads');
  }
  const legacy = await request('www.orbitflow.work', '/studio', owner);
  assert.match(await legacy.text(), /Project enquiries/);
});

test('workspace robots exclude all pages and only www publishes marketing URLs', async () => {
  for (const host of ['admin.orbitflow.work', 'app.orbitflow.work']) {
    assert.equal(await (await request(host, '/robots.txt')).text(), 'User-agent: *\nDisallow: /\n');
    assert.doesNotMatch(await (await request(host, '/sitemap.xml')).text(), /<loc>/);
  }
  const robots = await (await request('www.orbitflow.work', '/robots.txt')).text();
  assert.match(robots, /Disallow: \/portal/);
  assert.match(robots, /Sitemap: https:\/\/www.orbitflow.work\/sitemap.xml/);
});

test('API requests stay on the submitted origin and owner checks protect inbox reads and writes', async () => {
  for (const host of ['orbitflow.work', 'www.orbitflow.work', 'admin.orbitflow.work', 'app.orbitflow.work']) {
    for (const identity of [{}, client]) {
      assert.equal((await request(host, '/api/studio/enquiries', identity)).status, 403);
    }
    const mutation = await request(host, '/api/studio/enquiries', { ...client, 'content-type': 'application/json' }, { method: 'PATCH', body: '{}' });
    assert.equal(mutation.status, 403);
    assert.equal(mutation.headers.get('location'), null);
  }
  const crossOrigin = await request('admin.orbitflow.work', '/api/studio/enquiries', { ...owner, origin: 'https://www.orbitflow.work', 'content-type': 'application/json' }, { method: 'PATCH', body: '{}' });
  assert.equal(crossOrigin.status, 403);
});
