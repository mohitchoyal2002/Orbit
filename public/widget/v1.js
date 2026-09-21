/* OrbitFlow embed v1. Public site keys identify a configuration; no secrets belong here. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || window.OrbitFlowWidget) return;
  window.OrbitFlowWidget={getStatus:function(){return {ready:false,analytics:false};}};
  var site = script.getAttribute('data-orbit-site');
  // The first-party OrbitFlow marketing site uses the consent control without the coaching callback form.
  // Other embeds retain the full enquiry widget.
  var analyticsOnly = script.getAttribute('data-orbit-mode') === 'analytics';
  if (!/^[0-9a-f-]{36}$/.test(site || '') || !window.crypto || !crypto.randomUUID) return;
  var base = new URL(script.src).origin;
  var endpoint = base + '/api/widget/' + site;
  var storageKey = 'orbitflow:' + site;
  var cfg, shadow, host, token = '', tokenExpiry = 0, visitorKey = '', sessionId = '';
  var approved = false, queue = [], sending = false, stopped = false, retryAt = 0, failures = 0;
  var startedAt = Date.now(), requestId = crypto.randomUUID(), lastAction = Date.now(), lastTick = Date.now();
  var activeSeconds = 0, lastPath = '', milestones = new Set(), forms = new Set(), courseSeen = new Set();
  var privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  var consentBusy = false, pendingRevoke = '', bootEpoch = 0;
  function storeGet(key, session) { try { return JSON.parse((session ? sessionStorage : localStorage).getItem(key) || 'null'); } catch (_) { return null; } }
  function storeSet(key, value, session) { try { (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); } catch (_) {} }
  function storeRemove(key, session) { try { (session ? sessionStorage : localStorage).removeItem(key); } catch (_) {} }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function slug(v) { return typeof v === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(v) && !/[0-9]{6}/.test(v); }
  function safePath() {
    var p; try { p = decodeURIComponent(location.pathname); } catch (_) { return '/[redacted]'; }
    if (/(?:^|\/)(?:admin|account|profile|login|signin|checkout|payment|reset|auth|student|portal)(?:\/|$)/i.test(p)) return '/[private]';
    return p.split('/').map(function (s) { return !s ? '' : /^[a-z][a-z0-9_-]{0,63}$/i.test(s) && !/[0-9]{6}/.test(s) && !/[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(s) ? s : '[redacted]'; }).join('/').slice(0, 240);
  }
  function message(id, text) { if (shadow) shadow.getElementById(id).textContent = text; }
  function emit(type, props) {
    if (!approved || !token || stopped || privacySignal || safePath() === '/[private]') return;
    if (Date.now() >= tokenExpiry) { void beginAnalytics(); return; }
    if (queue.length >= 100) return;
    queue.push({ id: crypto.randomUUID(), type: type, path: safePath(), at: Date.now(), properties: props || {} });
    if (queue.length >= 15) void flush(false);
  }
  async function post(data, keepalive) {
    var r = await fetch(endpoint, { method:'POST', mode:'cors', credentials:'omit', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data), keepalive:!!keepalive, signal: keepalive ? undefined : AbortSignal.timeout(12000) });
    var j = await r.json();
    if (!r.ok) { var e = new Error(j.error || 'Unable to save. Please try again.'); e.status = r.status; e.retryAfter = Number(r.headers.get('retry-after') || 0); throw e; }
    return j;
  }
  async function flush(keepalive) {
    if (!approved || !token || stopped || sending || !queue.length || Date.now() < retryAt) return;
    sending = true;
    var batch = queue.slice(0, 20), epoch = bootEpoch;
    try {
      await post({action:'events', token:token, events:batch}, keepalive);
      if (epoch === bootEpoch) { var ids = new Set(batch.map(function (e) {return e.id;})); queue = queue.filter(function (e) {return !ids.has(e.id);}); failures = 0; }
    } catch (e) {
      if (epoch !== bootEpoch) return;
      failures++;
      retryAt = Date.now() + Math.max(e.retryAfter * 1000 || 0, Math.min(60000, Math.pow(2, failures) * 1000));
      if (e.status === 400) { var badIds = new Set(batch.map(function (e) {return e.id;})); queue = queue.filter(function (e) {return !badIds.has(e.id);}); }
      if (e.status === 401 || e.status === 404) { approved = false; queue = []; token = ''; message('privacy-status', 'Activity tracking stopped. Open privacy settings to restart.'); }
    } finally { sending = false; }
  }
  function attribution() {
    var q = new URLSearchParams(location.search), out = {};
    ['source','medium','campaign'].forEach(function (k) { var v = q.get('utm_' + k); if (v && /^[a-z][a-z0-9_-]{0,63}$/i.test(v) && !/[0-9]{6}/.test(v)) out[k] = v; });
    try { var h = new URL(document.referrer).hostname; if (h !== location.hostname && /^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/i.test(h)) out.referrer = h; } catch (_) {}
    return out;
  }
  async function beginAnalytics() {
    if (consentBusy || privacySignal || pendingRevoke || !visitorKey) return;
    consentBusy = true; var epoch = bootEpoch;
    var stored = storeGet(storageKey + ':session', true);
    sessionId = stored && Date.now() - stored.lastSeen < 30 * 60000 ? stored.id : crypto.randomUUID();
    try {
      var j = await post({action:'consent',analytics:true,version:cfg.version,visitorKey:visitorKey,sessionId:sessionId,attribution:attribution(),device:innerWidth < 640 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop'});
      if (epoch !== bootEpoch) return;
      token = j.token; tokenExpiry = j.expiresAt; approved = true; stopped = false; lastTick = Date.now(); activeSeconds = 0;
      storeSet(storageKey, {choice:'allowed',key:visitorKey,at:Date.now(),version:cfg.version});
      storeSet(storageKey + ':session', {id:sessionId,lastSeen:Date.now()}, true);
      shadow.getElementById('privacy').hidden = true;
      message('privacy-status', 'Activity analytics allowed. You can withdraw at any time.');
      lastPath = ''; pageChanged();
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.loadEventEnd > 0) emit('performance', {loadMs:Math.min(120000,Math.round(nav.loadEventEnd))});
      observeCourses();
    } catch (e) { message('privacy-status', e.message); } finally { consentBusy = false; }
  }
  async function accept() {
    if (privacySignal || pendingRevoke || consentBusy) return;
    visitorKey = visitorKey || crypto.randomUUID();
    await beginAnalytics();
  }
  async function retryRevocation() {
    if (!pendingRevoke) return true;
    var key = pendingRevoke;
    try { await post({action:'revoke',visitorKey:key}); if (pendingRevoke === key) { pendingRevoke = ''; storeRemove(storageKey + ':withdraw'); } message('privacy-status', analyticsOnly ? 'Activity history deleted. Analytics are off. Your submitted project enquiry remains available to OrbitFlow.' : 'Activity history deleted. Analytics are off. Your submitted enquiry remains available to the counsellor.'); return true; }
    catch (_) { message('privacy-status', 'Analytics are off. History deletion will retry when the connection returns.'); return false; }
  }
  async function withdraw() {
    bootEpoch++; approved = false; stopped = true; token = ''; queue = []; activeSeconds = 0;
    if (visitorKey) { pendingRevoke = visitorKey; storeSet(storageKey + ':withdraw', pendingRevoke); }
    visitorKey = ''; storeRemove(storageKey + ':session', true); storeSet(storageKey, {choice:'declined',version:cfg.version});
    await retryRevocation();
    if (!pendingRevoke) shadow.getElementById('privacy').hidden = true;
    if (!pendingRevoke) message('privacy-status', analyticsOnly ? 'Analytics are off. You can still contact OrbitFlow through the project enquiry form.' : 'Analytics are off. You can still submit an enquiry.');
  }
  function openPrivacy() { shadow.getElementById('privacy').hidden = false; }
  function open() {
    shadow.getElementById('panel').hidden = false; shadow.getElementById('launcher').setAttribute('aria-expanded', 'true');
    shadow.getElementById('close').focus(); emit('widget_open');
  }
  function close() { shadow.getElementById('panel').hidden = true; shadow.getElementById('launcher').setAttribute('aria-expanded','false'); shadow.getElementById('launcher').focus(); }
  function pageChanged() {
    var path = safePath();
    if (!approved || path === lastPath) return;
    lastPath = path; milestones = new Set(); forms = new Set(); courseSeen = new Set(); emit('page_view');
    observeCourses();
  }
  var observer;
  function observeCourses() {
    if (!approved || !('IntersectionObserver' in window)) return;
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var course = entry.target.getAttribute('data-orbit-course');
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !courseSeen.has(course) && cfg.courses.some(function (c) {return c.id === course;})) { courseSeen.add(course); emit('course_view',{course:course}); }
      });
    }, {threshold:0.5});
    document.querySelectorAll('[data-orbit-course]').forEach(function (el) {observer.observe(el);});
  }
  function heartbeat() {
    var now = Date.now(), elapsed = Math.max(0, Math.min(5, (now-lastTick)/1000)); lastTick=now;
    if (!approved || document.visibilityState !== 'visible' || now-lastAction > 60000) return;
    activeSeconds += elapsed;
    if (activeSeconds >= 10) { var seconds=Math.min(15,Math.floor(activeSeconds)); emit('active_time',{seconds:seconds}); activeSeconds=0; storeSet(storageKey + ':session',{id:sessionId,lastSeen:now},true); }
  }
  function installObservers() {
    ['pointerdown','keydown','scroll','touchstart'].forEach(function (type) { window.addEventListener(type,function () {lastAction=Date.now();}, {passive:true}); });
    window.addEventListener('scroll', function () {
      if (!approved) return;
      var height = document.documentElement.scrollHeight-innerHeight;
      if (height <= 100) return;
      var percent = Math.min(100,Math.round(scrollY/height*100));
      [25,50,75,100].forEach(function (m) {if (percent >= m && !milestones.has(m)) {milestones.add(m);emit('scroll',{percent:m});}});
    },{passive:true});
    document.addEventListener('click',function (e) {var el=e.target instanceof Element ? e.target.closest('[data-orbit-action]') : null; if (el && slug(el.getAttribute('data-orbit-action'))) emit('cta_click',{action:el.getAttribute('data-orbit-action')});});
    document.addEventListener('focusin',function (e) {var el=e.target instanceof Element ? e.target.closest('form[data-orbit-form]') : null; var f=el && el.getAttribute('data-orbit-form'); if (slug(f) && !forms.has(f)) {forms.add(f);emit('form_start',{form:f});}});
    document.addEventListener('submit',function (e) {var f=e.target instanceof Element && e.target.getAttribute('data-orbit-form');if (slug(f)) emit('form_submit',{form:f});},true);
    var videoMarks = new WeakMap();
    document.addEventListener('timeupdate',function (e) {
      var el=e.target; if (!(el instanceof HTMLVideoElement)) return;
      var v=el.getAttribute('data-orbit-video');if(!slug(v)||!el.duration||!isFinite(el.duration))return;
      var seen=videoMarks.get(el)||new Set();videoMarks.set(el,seen);
      [25,50,75,100].forEach(function(m){if(el.currentTime/el.duration*100>=m&&!seen.has(m)){seen.add(m);emit('video_progress',{video:v,percent:m});}});
    },true);
    ['pushState','replaceState'].forEach(function (method) {var original=history[method];history[method]=function(){var result=original.apply(this,arguments);pageChanged();return result;};});
    window.addEventListener('popstate',pageChanged);
    document.addEventListener('visibilitychange',function () {if(document.visibilityState==='hidden'){if(activeSeconds>=1)emit('active_time',{seconds:Math.min(15,Math.floor(activeSeconds))});activeSeconds=0;void flush(true);}lastTick=Date.now();});
    window.addEventListener('pagehide',function(){emit('session_end');void flush(true);});
    window.addEventListener('online',function(){retryAt=0;void retryRevocation();void flush(false);});
    window.addEventListener('storage',function(e){if(e.key===storageKey){var v=storeGet(storageKey);if(!v||v.choice!=='allowed'){bootEpoch++;approved=false;token='';queue=[];stopped=true;visitorKey='';activeSeconds=0;storeRemove(storageKey+':session',true);}}});
    setInterval(function(){heartbeat();void flush(false);},5000);
    setInterval(function(){if(pendingRevoke)void retryRevocation();},30000);
  }
  function render() {
    host=document.createElement('div');host.id='orbitflow-widget';shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML='<style>'+
      ':host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000;font:400 16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#20222b;color-scheme:light;--brand:'+cfg.color+'}*{box-sizing:border-box}[hidden]{display:none!important}button,input,select{font:inherit}button,a,input,select{outline-offset:4px}button{cursor:pointer;min-height:44px;border-radius:10px;padding:10px 15px;border:1px solid #ccd0db;background:#fff;color:#272936}button:disabled{opacity:.55;cursor:wait}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #535ee4}a{color:#3843a6}#launcher{background:#151824;color:#fff;box-shadow:0 8px 30px #0003;border:1px solid #424654;display:flex;align-items:center;gap:12px;padding:13px 20px;border-radius:30px}#launcher span{display:inline-grid;place-items:center;width:26px;height:26px;border:2px solid var(--brand);border-radius:50%;font-weight:700}#panel,#privacy{background:#fff;box-shadow:0 18px 65px #0003;border:1px solid #d8dce5;border-radius:18px;width:min(380px,calc(100vw - 32px));overflow:hidden}#panel{position:absolute;bottom:70px;right:0;max-height:calc(100dvh - 120px);overflow:auto}header{background:#171b29;color:#fff;padding:22px;display:flex;gap:16px;align-items:center;justify-content:space-between}h2{margin:0;font-size:20px;line-height:1.3}header small{display:block;color:#c5c9d8;font-size:14px;margin-top:6px}#close{background:#2d3242;color:#fff;border:0;padding:8px;min-width:42px;font-size:20px}#body{padding:22px}p{margin:0 0 16px;font-size:16px}label.field{display:grid;gap:6px;margin-bottom:14px;font-size:14px;font-weight:600}input:not([type=checkbox]),select{width:100%;min-height:46px;padding:10px 12px;color:#20222b;background:#fff;border:1px solid #bbc1d0;border-radius:8px}label.check{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin:16px 0;font-weight:400}input[type=checkbox]{flex:none;appearance:auto;width:18px;height:18px;margin:2px 0 0;accent-color:#333d9f}.primary{background:#202639;color:#fff;border-color:#202639;font-weight:600}#send{width:100%}#error{color:#a32331;margin-top:12px;font-size:14px}#success{background:#eff7f2;border:1px solid #b9d6c3;padding:16px;border-radius:10px}footer{border-top:1px solid #e5e7ec;padding:12px 22px;font-size:12px;color:#626a7e;display:flex;align-items:center;justify-content:space-between;gap:10px}footer button{border:0;background:transparent;font-size:14px;padding:5px;min-height:36px}#privacy{position:absolute;bottom:70px;right:0;padding:22px;z-index:2}#privacy h2{font-size:18px;margin-bottom:12px}#privacy p{font-size:14px;color:#4d5569;line-height:1.6}#privacy .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}#privacy-status{font-size:12px;margin:10px 0 0;color:#535d70}.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.note{font-size:12px;color:#626a7e;line-height:1.6}@media(max-width:480px){:host{right:16px;bottom:16px}#panel{max-height:calc(100dvh - 110px)}#body{padding:18px}#privacy{max-height:calc(100dvh - 110px);overflow:auto}}@media(prefers-reduced-motion:no-preference){#panel{animation:appear .2s ease-out}@keyframes appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}' +
      ':host{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.65}#panel,#privacy{border-radius:22px;border-color:#d9dde3;box-shadow:0 24px 80px #0d152738}header{background:#181c21;border-top:4px solid var(--brand);padding:23px}h2{font-family:Plus Jakarta Sans,Inter,system-ui,sans-serif;letter-spacing:-.02em;font-weight:600;line-height:1.35}#launcher{background:#171b20;border-color:#ffffff30;padding:14px 21px;transition:transform .25s,box-shadow .25s}#launcher:hover{transform:translateY(-3px);box-shadow:0 12px 36px #0004}#launcher:active{transform:scale(.96)}button{border-radius:100px;transition:background .2s,border-color .2s,transform .2s}button:active:not(:disabled){transform:scale(.97)}#close{border-radius:50%;width:40px;height:40px;padding:0;min-height:40px;transition:rotate .25s}#close:hover{rotate:90deg}input:not([type=checkbox]),select{border-radius:10px;background:#f7f8fa;transition:box-shadow .2s,border-color .2s}input:focus,select:focus{border-color:#616b7a;box-shadow:0 0 0 3px #5a657e16}input[type=checkbox]{accent-color:#242b35}#body{padding:24px}#send{min-height:50px;border:0;background:#1c232d}#send:hover{background:#343f4f}footer{background:#f6f7f9;padding:13px 20px}#privacy{padding:24px}#privacy h2{font-size:23px;line-height:1.25}#privacy #allow,#privacy #decline{background:#fff;color:#202633;border-color:#8793a3;font-weight:600}#privacy #allow:hover,#privacy #decline:hover{background:#edf0f4}#success{border-radius:14px;padding:22px}#success strong{display:block;margin-bottom:10px;font-size:20px}#success #another{border-color:#88ae97;background:transparent}#error:not(:empty){padding:12px;background:#fff0ef;border:1px solid #e8b6b0;border-radius:10px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline-color:#48566e}@media(prefers-reduced-motion:no-preference){#panel{transform-origin:bottom right;animation:orbit-open .32s cubic-bezier(.2,.8,.3,1)}#privacy{animation:orbit-open .3s ease-out}#success{animation:orbit-confirm .35s ease-out}@keyframes orbit-open{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}@keyframes orbit-confirm{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}}:host([data-motion=off]) *{animation:none!important;transition:none!important}:host([data-motion=off]) #launcher{transform:none!important}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}#launcher{transform:none!important}}@media(max-width:480px){#body{padding:20px}#panel,#privacy{width:min(380px,calc(100vw - 32px));border-radius:18px}#privacy .actions{grid-template-columns:1fr 1fr;gap:10px}}#panel,#privacy{background:linear-gradient(135deg,#ffffffdc,#ffffff30),#f1f5fa;border:1px solid #ffffffb3;box-shadow:0 24px 75px #101c3540,inset 0 1px #fff}header{background:linear-gradient(135deg,#28384b,#171f2d);border-top-color:var(--brand)}#launcher{background:linear-gradient(135deg,#ffffff1c,transparent),#182333;border-color:#d9e7fb59;box-shadow:0 12px 32px #0003,inset 0 1px #ffffff40}#launcher:hover{box-shadow:0 16px 40px #0004,inset 0 1px #ffffff70}footer{background:#f6f8fcdd}.note{font-size:13px;color:#526074}input:not([type=checkbox]),select{font-size:16px;line-height:1.5}#privacy p{font-size:15px;color:#435166}#privacy h2{font-size:22px}#success strong{font-weight:600;line-height:1.4}@supports((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#panel,#privacy{background:linear-gradient(135deg,#ffffffcc,#ffffff30),#f1f5faf0;-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%)}#launcher{-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}}@media(max-width:480px){#panel,#privacy{-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}}@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){#panel,#privacy{background:#f6f8fc;border-color:#67778e;-webkit-backdrop-filter:none;backdrop-filter:none}#launcher{-webkit-backdrop-filter:none;backdrop-filter:none}}@media(forced-colors:active){#panel,#privacy,header,footer,#launcher{background:Canvas;color:CanvasText;border:1px solid CanvasText;box-shadow:none}p,h2,small,.note,#privacy p{color:CanvasText}}' +
      '</style><section id="panel" role="dialog" aria-label="Course enquiry" hidden><header><div><h2>Find your next course</h2><small>'+esc(cfg.name)+'</small></div><button id="close" aria-label="Close enquiry">×</button></header><div id="body"><p>Tell us what you want to learn. A counsellor can help you choose.</p><form id="enquiry"><label class="field">Your name<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label><label class="field">Mobile number<input name="phone" type="tel" autocomplete="tel" required maxlength="25" placeholder="10-digit mobile or +country code"></label><label class="field">Email (optional)<input name="email" type="email" autocomplete="email" maxlength="254"></label><label class="field">Interested in<select name="course">'+cfg.courses.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>';}).join('')+'</select></label><div class="trap" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><label class="check"><input type="checkbox" name="contact" required><span>'+esc(cfg.contactNotice)+'</span></label><label class="check"><input type="checkbox" name="whatsapp"><span>'+esc(cfg.whatsappNotice)+'</span></label>'+(cfg.callingEnabled?'<label class="check"><input type="checkbox" name="aicall"><span>'+esc(cfg.callNotice)+(cfg.callingTestMode?' Test mode: no phone call will be placed.':'')+'</span></label>':'')+'<p class="note">Your contact details are submitted only when you send this form. Analytics are optional. <a href="'+esc(cfg.privacyUrl)+'" target="_blank" rel="noopener noreferrer">Privacy information</a></p><button id="send" class="primary" type="submit">Request a callback</button><p id="error" role="alert"></p></form><div id="success" role="status" hidden><strong>Enquiry saved.</strong><p>The institute can now follow up about your chosen course.</p><button id="another">Start another enquiry</button></div></div><footer><span>Powered by OrbitFlow</span><button id="settings">Privacy settings</button></footer></section><aside id="privacy" aria-label="Activity analytics choice"><h2>Your activity. Your choice.</h2><p>'+esc(cfg.analyticsNotice)+'</p><p>Activity is kept for up to '+cfg.retentionDays+' days in active reports. <a href="'+esc(cfg.privacyUrl)+'" target="_blank" rel="noopener noreferrer">Privacy details</a></p><div class="actions"><button id="decline">No analytics</button><button id="allow" class="primary">Allow analytics</button></div><p id="privacy-status" role="status"></p></aside><button id="launcher" aria-label="'+(analyticsOnly?'Open privacy settings':'Open course enquiry')+'" aria-expanded="false"><img src="'+base+'/orbitflow-logo.svg" width="28" height="28" alt="">'+(analyticsOnly?'Privacy & activity':'Course help')+'</button>';
    if(script.nonce)shadow.querySelector("style").setAttribute("nonce",script.nonce);
    document.body.appendChild(host);
    var motionSync=function(){host.dataset.motion=document.documentElement.dataset.motion==='off'?'off':'on';};
    motionSync();
    new MutationObserver(motionSync).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
    shadow.getElementById('launcher').onclick=function(){if(analyticsOnly){openPrivacy();return;}shadow.getElementById('privacy').hidden=true;open();};
    shadow.getElementById('close').onclick=close;shadow.getElementById('settings').onclick=openPrivacy;
    shadow.getElementById('allow').onclick=function(){void accept();};shadow.getElementById('decline').onclick=function(){void withdraw();};
    shadow.addEventListener('keydown',function(e){if(e.key==='Escape'){shadow.getElementById('privacy').hidden=true;close();}});
    shadow.getElementById('enquiry').addEventListener('focusin',function(){if(!forms.has('orbit-enquiry')){forms.add('orbit-enquiry');emit('form_start',{form:'orbit-enquiry'});}});
    shadow.querySelector('select').onchange=function(e){emit('course_view',{course:e.target.value});};
    shadow.getElementById('another').onclick=function(){requestId=crypto.randomUUID();startedAt=Date.now();shadow.getElementById('enquiry').reset();shadow.getElementById('enquiry').hidden=false;shadow.getElementById('success').hidden=true;message('error','');};
    shadow.getElementById('enquiry').onsubmit=async function(e){
      e.preventDefault();var button=shadow.getElementById('send');if(button.disabled)return;
      var f=new FormData(e.target);button.disabled=true;button.textContent='Saving…';message('error','');
      var payload={action:'lead',requestId:requestId,name:String(f.get('name')),phone:String(f.get('phone')),email:String(f.get('email')||''),course:String(f.get('course')),contactConsent:f.get('contact')==='on',whatsappConsent:f.get('whatsapp')==='on',callConsent:f.get('aicall')==='on',version:cfg.version,startedAt:startedAt,website:String(f.get('website')||'')};
      if(approved&&token&&Date.now()<tokenExpiry)payload.token=token;
      try {
        try {await post(payload);} catch(err) {if(err.status===401&&payload.token){delete payload.token;await post(payload);}else throw err;}
        emit('form_submit',{form:'orbit-enquiry'});void flush(false);
        e.target.hidden=true;shadow.getElementById('success').hidden=false;shadow.getElementById('another').focus();
      }catch(err){message('error',err.message);}finally{button.disabled=false;button.textContent='Request a callback';}
    };
  }
  async function boot() {
    try {
      var r=await fetch(endpoint,{mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Error();cfg=await r.json();
      if(!/^#[0-9a-f]{6}$/i.test(cfg.color))cfg.color='#fa783c';
      if(!Array.isArray(cfg.courses)||!cfg.courses.length)throw Error();
      render();installObservers();
      var saved=storeGet(storageKey);pendingRevoke=storeGet(storageKey+':withdraw')||'';
      if(saved&&saved.choice==='allowed'&&saved.key){visitorKey=saved.key;}
      if(privacySignal){shadow.getElementById('allow').disabled=true;message('privacy-status','Your browser privacy preference is respected. Analytics stay off.');if(visitorKey)await withdraw();}
      else if(pendingRevoke){await retryRevocation();}
      else if(saved&&saved.choice==='allowed'&&saved.version===cfg.version&&Date.now()-saved.at<180*86400000){await beginAnalytics();}
      else if(saved&&saved.choice==='declined'){shadow.getElementById('privacy').hidden=true;}
      window.OrbitFlowWidget={
        open:open,privacy:openPrivacy,withdraw:withdraw,refresh:observeCourses,
        track:function(type,props){if(type==='cta_click'&&props&&slug(props.action))emit(type,{action:props.action});if(type==='course_view'&&props&&cfg.courses.some(function(c){return c.id===props.course;}))emit(type,{course:props.course});},
        getStatus:function(){return {ready:true,analytics:approved,withdrawalPending:!!pendingRevoke,queuedEvents:queue.length};}
      };
      window.dispatchEvent(new CustomEvent('orbitflow:ready'));
    }catch(_){window.OrbitFlowWidget={getStatus:function(){return {ready:false,analytics:false,error:'Widget unavailable. Check the embed key and allowed domain.'};}};window.dispatchEvent(new CustomEvent('orbitflow:error'));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){void boot();},{once:true});else void boot();
})();
