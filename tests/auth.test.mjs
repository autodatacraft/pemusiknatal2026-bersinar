import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import auth from '../api/auth.js';
import preparation from '../api/preparation.js';
import { authenticated, matchesPassword, sessionCookie } from '../lib/server.js';
const savedEnv = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test-server-only';
  process.env.TEAM_PASSWORD = 'test-only-password';
  global.fetch = async () => ({ok:true,json:async()=>true});
});
afterEach(() => {
  global.fetch=originalFetch;
  for(const k of Object.keys(process.env))if(!(k in savedEnv))delete process.env[k];
  Object.assign(process.env,savedEnv);
});
function response() {
  return { statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;} };
}
function request(method, body, cookie) { return {method,body,headers:{host:'bersinar.example',origin:'https://bersinar.example','content-type':'application/json',cookie}}; }
const cookieValue = value => value.split(';')[0];
test('correct password creates a private signed session without exposing secrets',async()=>{
  const res=response();await auth(request('POST',{password:'test-only-password'}),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.authenticated,true);
  assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  assert.equal(authenticated(request('GET',null,cookieValue(res.headers['Set-Cookie']))),true);
  assert.ok(!JSON.stringify(res).includes(process.env.TEAM_PASSWORD));
  assert.ok(!JSON.stringify(res).includes(process.env.SUPABASE_SECRET_KEY));
});
test('wrong passwords never create a session',async()=>{
  const res=response();await auth(request('POST',{password:'wrong'}),res);
  assert.equal(res.statusCode,401);assert.equal(res.headers['Set-Cookie'],undefined);
  assert.equal(await matchesPassword(null),false);
  assert.equal(await matchesPassword('x'.repeat(257)),false);
});
test('login throttling is checked before password verification',async()=>{
  global.fetch=async()=>({ok:true,json:async()=>false});
  const res=response();await auth(request('POST',{password:'test-only-password'}),res);
  assert.equal(res.statusCode,429);assert.equal(res.headers['Retry-After'],'900');
  assert.equal(res.headers['Set-Cookie'],undefined);
});
test('tampered, expired, missing and password-rotated sessions are rejected',()=>{
  const now=Date.now(), cookie=cookieValue(sessionCookie(now));
  assert.equal(authenticated(request('GET',null,cookie),now),true);
  assert.equal(authenticated(request('GET',null,cookie),now+8*86400000),false);
  assert.equal(authenticated(request('GET',null,cookie.replace(/.$/,'!'))),false);
  assert.equal(authenticated(request('GET')),false);
  process.env.TEAM_PASSWORD='rotated-test-password';
  assert.equal(authenticated(request('GET',null,cookie)),false);
});
test('session status and logout use HttpOnly cookie, not browser tokens',async()=>{
  const cookie=cookieValue(sessionCookie());let res=response();
  await auth(request('GET',null,cookie),res);assert.equal(res.body.authenticated,true);
  res=response();await auth(request('DELETE',null,cookie),res);
  assert.equal(res.body.authenticated,false);assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
});
test('cross-origin login and writes are rejected',async()=>{
  let req=request('POST',{password:'test-only-password'});req.headers.origin='https://other.example';
  let res=response();await auth(req,res);assert.equal(res.statusCode,403);
  req=request('PUT',{},cookieValue(sessionCookie()));req.headers.origin='https://other.example';
  res=response();await preparation(req,res);assert.equal(res.statusCode,403);
});
test('data endpoint never reaches database without a valid session',async()=>{
  global.fetch=async()=>{throw new Error('Database must not be called');};
  for(const method of ['GET','PUT']){const res=response();await preparation(request(method,{}),res);assert.equal(res.statusCode,401);}
});
test('data read and writes are routed through authenticated server and preserve conflicts',async()=>{
  const payload=JSON.parse(fs.readFileSync(new URL('../supabase/seed.json',import.meta.url),'utf8'));
  const cookie=cookieValue(sessionCookie());
  global.fetch=async(url,options)=>{
    assert.equal(options.headers.apikey,process.env.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization,undefined);
    assert.ok(url.startsWith(process.env.SUPABASE_URL));
    return {ok:true,json:async()=>[{payload,revision:2}]};
  };
  let res=response();await preparation(request('GET',null,cookie),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.revision,2);
  global.fetch=async(url,options)=>{
    assert.match(url,/save_preparation_server/);
    assert.equal(JSON.parse(options.body).p_revision,2);
    return {ok:false,status:409};
  };
  res=response();await preparation(request('PUT',{payload,revision:2},cookie),res);assert.equal(res.statusCode,409);
  res=response();await preparation(request('PUT',{payload:{},revision:2},cookie),res);assert.equal(res.statusCode,400);
});
test('missing backend configuration fails closed',async()=>{
  delete process.env.SUPABASE_SECRET_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res=response();await auth(request('GET'),res);assert.equal(res.statusCode,503);
});
test('email authentication and browser database keys are removed',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const sync=fs.readFileSync(new URL('../public/sync.js',import.meta.url),'utf8');
  assert.ok(html.includes('type="password"'));
  assert.ok(!html.includes('type="email"'));
  assert.ok(!sync.includes('/auth/v1/'));
  assert.ok(!sync.includes('Authorization'));
  assert.ok(!fs.existsSync(new URL('../api/config.js',import.meta.url)));
});

test('first login initializes an empty preparation without overwriting concurrent data',async()=>{
  const cookie=cookieValue(sessionCookie());
  const payload=JSON.parse(fs.readFileSync(new URL('../supabase/seed.json',import.meta.url),'utf8'));
  const concurrent=structuredClone(payload);concurrent.songs[0].key='D';
  let calls=0;
  global.fetch=async(url,options)=>{
    calls++;
    if(calls===1)return {ok:true,json:async()=>[]};
    if(calls===2){
      assert.equal(options.method,'POST');
      assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
      assert.equal(options.headers.apikey,process.env.SUPABASE_SECRET_KEY);
      assert.match(url,/on_conflict=id/);
      const body=JSON.parse(options.body);
      assert.equal(body.id,'natal2026');assert.equal(body.revision,0);
      assert.deepEqual(body.payload,payload);
      return {ok:true,status:204};
    }
    // Another first-login request may have inserted/updated before the refetch.
    return {ok:true,json:async()=>[{payload:concurrent,revision:1}]};
  };
  const res=response();await preparation(request('GET',null,cookie),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.payload.songs[0].key,'D');
  assert.equal(res.body.revision,1);assert.equal(calls,3);
});
test('existing invalid preparation is reported and never replaced with defaults',async()=>{
  let calls=0;
  global.fetch=async()=>{calls++;return {ok:true,json:async()=>[{payload:{invalid:true},revision:8}]};};
  const res=response();await preparation(request('GET',null,cookieValue(sessionCookie())),res);
  assert.equal(res.statusCode,503);assert.equal(res.body.code,'PREPARATION_INVALID');assert.equal(calls,1);
});
test('missing tables and permissions have actionable errors without leaking backend details',async()=>{
  const prior=console.error;console.error=()=>{};
  try {
    for(const [status,code,expected] of [[404,'PGRST205','DATABASE_SETUP_REQUIRED'],[403,'42501','DATABASE_PERMISSION_DENIED']]){
      global.fetch=async()=>({ok:false,status,json:async()=>({code,message:'private backend detail'})});
      const res=response();await preparation(request('GET',null,cookieValue(sessionCookie())),res);
      assert.equal(res.statusCode,503);assert.equal(res.body.code,expected);
      assert.ok(!JSON.stringify(res.body).includes('private backend detail'));
      assert.ok(!JSON.stringify(res.body).includes(process.env.SUPABASE_SECRET_KEY));
    }
  }finally{console.error=prior;}
});
test('password migration includes initial data and preserves existing rows',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/002_password_auth.sql',import.meta.url),'utf8');
  assert.match(sql,/grant select, insert on public\.preparations to service_role/);
  assert.match(sql,/insert into public\.preparations\(id,payload\)/);
  assert.match(sql,/on conflict \(id\) do nothing/);
});
