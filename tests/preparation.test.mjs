import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import preparation from '../api/preparation.js';
const savedEnv = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test-server-only';
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
test('cross-origin writes are rejected without a session',async()=>{
  const req=request('PUT',{});req.headers.origin='https://other.example';
  const res=response();await preparation(req,res);assert.equal(res.statusCode,403);
});
test('data read and writes are routed through server without a session and preserve conflicts',async()=>{
  const payload=JSON.parse(fs.readFileSync(new URL('../supabase/seed.json',import.meta.url),'utf8'));
  const cookie=undefined;
  global.fetch=async(url,options)=>{
    assert.equal(options.headers.apikey,process.env.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization,undefined);
    assert.ok(url.startsWith(process.env.SUPABASE_URL));
    return {ok:true,json:async()=>[{payload,revision:2}]};
  };
  let res=response();await preparation(request('GET',null,cookie),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.revision,2);
  global.fetch=async()=>({ok:true,json:async()=>({revision:3})});
  res=response();await preparation(request('PUT',{payload,revision:2}),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.revision,3);
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
  const res=response();await preparation(request('GET'),res);assert.equal(res.statusCode,503);
});
test('email authentication and browser database keys are removed',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const sync=fs.readFileSync(new URL('../public/sync.js',import.meta.url),'utf8');
  assert.ok(!html.includes('type="password"'));
  assert.ok(!html.includes('authgate'));
  assert.ok(!sync.includes('/api/auth'));
  assert.ok(!fs.existsSync(new URL('../api/auth.js',import.meta.url)));
  assert.ok(!html.includes('type="email"'));
  assert.ok(!sync.includes('/auth/v1/'));
  assert.ok(!sync.includes('Authorization'));
  assert.ok(!fs.existsSync(new URL('../api/config.js',import.meta.url)));
});

test('first visit initializes an empty preparation without overwriting concurrent data',async()=>{
  const cookie=undefined;
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
    // Another first-visit request may have inserted/updated before the refetch.
    return {ok:true,json:async()=>[{payload:concurrent,revision:1}]};
  };
  const res=response();await preparation(request('GET',null,cookie),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.payload.songs[0].key,'D');
  assert.equal(res.body.revision,1);assert.equal(calls,3);
});
test('existing invalid preparation is reported and never replaced with defaults',async()=>{
  let calls=0;
  global.fetch=async()=>{calls++;return {ok:true,json:async()=>[{payload:{invalid:true},revision:8}]};};
  const res=response();await preparation(request('GET',null,undefined),res);
  assert.equal(res.statusCode,503);assert.equal(res.body.code,'PREPARATION_INVALID');assert.equal(calls,1);
});
test('missing tables and permissions have actionable errors without leaking backend details',async()=>{
  const prior=console.error;console.error=()=>{};
  try {
    for(const [status,code,expected] of [[404,'PGRST205','DATABASE_SETUP_REQUIRED'],[403,'42501','DATABASE_PERMISSION_DENIED']]){
      global.fetch=async()=>({ok:false,status,json:async()=>({code,message:'private backend detail'})});
      const res=response();await preparation(request('GET',null,undefined),res);
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

