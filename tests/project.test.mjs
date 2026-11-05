import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../api/config.js';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const domain = app.slice(0, app.indexOf('function render()'));
const state = vm.runInNewContext(domain + ';({fresh,valid})', {});
test('all five service sections preserve the intended arrangements', () => {
  const data = state.fresh();
  assert.equal(data.songs.length, 5);
  assert.equal(state.valid(data), true);
  assert.match(data.songs[0].guide, /Perkenalkan melodi/);
  assert.match(data.songs[1].guide, /drum dan bass/);
  assert.match(data.songs[2].guide, /megah tetapi mudah/);
  assert.match(data.songs[3].guide, /sederhana dan reflektif/);
  assert.match(data.songs[4].intro, /Piano saja/);
  assert.ok(data.songs.every(s => s.roles.length === 4 && s.checks.every(c => c === false)));
  assert.equal(state.valid({ ...data, songs: [data.songs[0], ...data.songs.slice(0,4)] }), false);
  assert.equal(state.valid({ ...data, songs: [] }), false);
});

function configResponse() {
  return { statusCode: 200, setHeader() {}, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
}
test('config endpoint refuses unconfigured projects and secret keys', () => {
  const old = {...process.env};
  try {
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; delete process.env.SUPABASE_ANON_KEY;
    let res=configResponse(); handler({method:'GET'},res); assert.equal(res.statusCode,503);
    process.env.SUPABASE_URL='https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_do-not-return';
    res=configResponse(); handler({method:'GET'},res); assert.equal(res.statusCode,503); assert.ok(!JSON.stringify(res.body).includes('sb_secret'));
    process.env.SUPABASE_PUBLISHABLE_KEY='x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x';
    res=configResponse(); handler({method:'GET'},res); assert.equal(res.statusCode,503);
    process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
    res=configResponse(); handler({method:'GET'},res); assert.equal(res.statusCode,200); assert.equal(res.body.key,'sb_publishable_test');
  } finally { for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key]; Object.assign(process.env,old); }
});

async function syncHarness({ denied=false, conflict=false }={}) {
  const nodes = new Map(), timers=[], calls=[];
  const node = id => nodes.get(id) || nodes.set(id, { textContent:'',hidden:false,disabled:false,children:[],
    replaceChildren(){this.children=[];},append(...x){this.children.push(...x);},addEventListener(){},click(){} }).get(id);
  let server=state.fresh(), rev=3;
  const context = {
    document:{ getElementById:node, createElement:tag=>node(Math.random()+tag),createTextNode:text=>text,body:{classList:{remove(){}}},hidden:false },
    window:{ addEventListener(){} }, localStorage:{getItem:()=>JSON.stringify({access_token:'test',refresh_token:'test',expires_at:Date.now()+3600000}),setItem(){},removeItem(){}},
    location:{hash:'',origin:'https://bersinar.example',pathname:'/'},history:{replaceState(){}},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
    URLSearchParams,JSON,Date,console,confirm:()=>true,
    data:null,selected:null,valid:state.valid,render(){},closeModal(){},
    fetch:async (url,options={})=>{
      calls.push({url,options});
      if (url==='/api/config') return {ok:true,json:async()=>({url:'https://example.supabase.co',key:'public-test'})};
      if (url.includes('/rpc/')) {
        if(conflict) return {status:409,ok:false};
        const b=JSON.parse(options.body);assert.equal(b.p_revision,rev);server=b.p_payload;rev++;
        return {ok:true,json:async()=>({revision:rev})};
      }
      return {ok:true,json:async()=>denied?[]:[{payload:structuredClone(server),revision:rev}]};
    }
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/sync.js',import.meta.url),'utf8'),context);
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  return {context,nodes,timers,calls,node,getServer:()=>server};
}
test('shared sync loads server data, saves against a revision and advances it',async()=>{
  const h=await syncHarness();
  assert.equal(h.node('authgate').hidden,true);
  h.context.data.songs[0].key='G';
  h.context.window.bersinarSync.queue(h.context.data);
  await h.timers.at(-1).fn();
  assert.equal(h.getServer().songs[0].key,'G');
  assert.equal(h.context.window.bersinarSync.status,'Tersinkron dengan tim');
  h.context.data.songs[0].tempo='90';h.context.window.bersinarSync.queue(h.context.data);await h.timers.at(-1).fn();
  assert.equal(h.getServer().songs[0].tempo,'90');
});
test('conflicting teammate changes stop writes and preserve local edits',async()=>{
  const h=await syncHarness({conflict:true});
  h.context.data.songs[0].key='D';h.context.window.bersinarSync.queue(h.context.data);await h.timers.at(-1).fn();
  assert.equal(h.context.data.songs[0].key,'D');
  assert.equal(h.getServer().songs[0].key,'');
  assert.equal(h.context.window.bersinarSync.status,'Ada perubahan dari rekan tim');
  assert.equal(h.node('syncbanner').hidden,false);
  const writes=h.calls.filter(c=>c.url.includes('/rpc/')).length;
  h.context.window.bersinarSync.queue(h.context.data);await h.timers.at(-1).fn();
  assert.equal(h.calls.filter(c=>c.url.includes('/rpc/')).length,writes);
});
test('nonmembers never reach the preparation editor',async()=>{
  const h=await syncHarness({denied:true});
  assert.notEqual(h.node('authgate').hidden,true);
  assert.match(h.node('authstatus').textContent,/belum mendapat akses/);
  assert.equal(h.context.data,null);
});
