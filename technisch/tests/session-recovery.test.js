import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../../app/${file}`, import.meta.url), "utf8");

test("versiegebonden appbestanden laden direct uit de juiste cache zonder netwerkrequest", async () => {
  const entries = new Map([["https://app.test/app.js?v=one", new Response("one")]]);
  const key = request => typeof request === "string" ? request : request.url;
  let requests = 0;
  const context = vm.createContext({ URL, Response, AbortController, setTimeout, clearTimeout,
    self: { addEventListener() {}, location: { origin: "https://app.test" } },
    caches: { open: async () => ({ match: async request => entries.get(key(request))?.clone(), put: async (request, response) => entries.set(key(request), response) }) },
    fetch: async () => { requests++; return new Response("two"); }
  });
  vm.runInContext(await read("service-worker.js"), context);
  const event = { request: { url: "https://app.test/app.js?v=one" }, waitUntil() {} };
  assert.equal(await (await context.cachedAppFile(event)).text(), "one");
  assert.equal(requests, 0);
  assert.equal(await (await context.cachedAppFile({ ...event, request: { url: "https://app.test/app.js?v=two" } })).text(), "two");
  assert.equal(requests, 1);
});

test("Supabase herhaalt alleen een expliciet geweigerde future-JWT request, maximaal eenmaal", async () => {
  let options; let calls = 0;
  let failure = { code: "PGRST303", message: "JWT issued at future" };
  const context = vm.createContext({ URL, Request,
    setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout,
    fetch: async request => {
      calls++;
      assert.equal(await request.text(), "payload");
      return new Response(JSON.stringify(failure), { status: 401 });
    },
    OveruurtjeConfig: { calculatorUrl: "https://app.test/index.html", supabaseUrl: "https://db.test", supabaseAnonKey: "public" },
    supabase: { createClient: (_url, _key, value) => { options = value; return {}; } }
  });
  vm.runInContext(await read("saas/supabaseClient.js"), context);
  await context.OveruurtjeSupabase.getClient();
  await options.global.fetch("https://db.test/rest/v1/rpc/get_my_account_profile", { method: "POST", body: "payload" });
  assert.equal(calls, 2);
  calls = 0;
  failure = { code: "PGRST303", message: "JWT expired" };
  await options.global.fetch("https://db.test/rest/v1/profiles", { method: "POST", body: "payload" });
  assert.equal(calls, 1);
});

test("eigen profielcontrole behoudt betaald Pro zonder directe tabeltoegang", async () => {
  const context = vm.createContext({ URL, console,
    OveruurtjeSupabase: { getClient: async () => ({
      rpc: async (name) => {
        assert.equal(name, "get_my_account_profile");
        return { data: { id: "paid", is_pro: true, subscription_status: "active", avatar_url: "https://example.test/photo.jpg" }, error: null };
      },
      from: () => { throw new Error("permission denied for table profiles"); }
    }) }
  });
  vm.runInContext(await read("saas/profileService.js"), context);
  const profile = await context.OveruurtjeProfiles.getForUser({ id: "paid" });
  assert.equal(profile.isPro, true);
  assert.equal(profile.avatarUrl, "https://example.test/photo.jpg");
});

test("profielcontrole verbergt fouten en ontbrekende accounts niet als Free", async () => {
  let response = { data: null, error: { code: "42501", message: "permission denied" } };
  const context = vm.createContext({ URL, console,
    OveruurtjeSupabase: { getClient: async () => ({ rpc: async () => response }) }
  });
  vm.runInContext(await read("saas/profileService.js"), context);
  await assert.rejects(context.OveruurtjeProfiles.getForUser({ id: "paid" }), error => error.code === "42501");
  response = { data: null, error: null };
  await assert.rejects(context.OveruurtjeProfiles.getForUser({ id: "paid" }), /accountprofiel ontbreekt/);
});

test("PWA haalt online de gevraagde nieuwe code op in plaats van een oude cacheversie", async () => {
  const entries = new Map([["https://example.test/liveWorkday.js", new Response("old")]]);
  const key = (request) => typeof request === "string" ? request : request.url;
  const cache = { match: async (request) => entries.get(key(request))?.clone(), put: async (request,response) => entries.set(key(request), response) };
  let online = true;
  const context = vm.createContext({
    self:{addEventListener(){},location:{origin:"https://example.test"}},
    caches:{open:async()=>cache}, URL, Response, AbortController, setTimeout, clearTimeout,
    fetch:async()=>{if(!online)throw new Error("offline");return new Response("new");}
  });
  vm.runInContext(await read("service-worker.js"),context);
  const request={url:"https://example.test/liveWorkday.js?v=new",mode:"cors"};
  assert.equal(await (await context.networkFirst({request})).text(),"new");
  online=false;
  assert.equal(await (await context.networkFirst({request})).text(),"new");
  assert.equal(await (await context.networkFirst({request:{url:"https://example.test/liveWorkday.js?v=uncached",mode:"cors"}})).text(),"old");
});

test("inlogmodule is lokaal, gedeeld tussen requests en herstelbaar na laadfout", async () => {
  const scripts=[];
  const context=vm.createContext({
    URL,setTimeout,clearTimeout,
    OveruurtjeConfig:{calculatorUrl:"https://example.test/index.html",supabaseUrl:"https://db.test",supabaseAnonKey:"public"},
    document:{
      createElement:()=>{const listeners={};return {dataset:{},addEventListener:(name,handler)=>{listeners[name]=handler;},remove(){},listeners};},
      head:{append:(script)=>scripts.push(script)}
    }
  });
  vm.runInContext(await read("saas/supabaseClient.js"),context);
  const first=context.OveruurtjeSupabase.getClient();
  const second=context.OveruurtjeSupabase.getClient();
  const rejected=Promise.allSettled([first,second]);
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,"https://example.test/vendor/supabase.js");
  scripts[0].listeners.error();
  assert.ok((await rejected).every(result=>result.status==="rejected"));
  const retry=context.OveruurtjeSupabase.getClient();
  assert.equal(scripts.length,2);
  context.supabase={createClient:()=>({ok:true})};
  scripts[1].listeners.load();
  assert.equal((await retry).ok,true);
});

test("auth-initialisatie kan opnieuw na een tijdelijke fout zonder foutstatus te behouden", async () => {
  let attempts=0;
  const user={id:"test-user"};
  const context=vm.createContext({
    URL,Set,console,
    CustomEvent:class {constructor(type,values){this.type=type;this.detail=values?.detail;}},
    document:{dispatchEvent(){}},
    OveruurtjeConfig:{authAccountUrl:"https://example.test/account.html"},
    OveruurtjeSupabase:{getClient:async()=>{
      if(attempts++===0)throw new Error("offline");
      return {auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange(){}}};
    }}
  });
  vm.runInContext(await read("saas/authService.js"),context);
  await context.OveruurtjeAuth.ready;
  assert.ok(context.OveruurtjeAuth.getState().error);
  await context.OveruurtjeAuth.initialize();
  assert.equal(context.OveruurtjeAuth.getState().user.id,"test-user");
  assert.equal(context.OveruurtjeAuth.getState().error,null);
});

test("inloggen werkt na een mislukte sessieherstelpoging en registreert de listener slechts eenmaal", async()=>{
  let listener;let subscriptions=0;
  const user={id:"paid-account"};
  const client={auth:{
    getSession:async()=>({data:{session:null},error:new Error("temporary restore error")}),
    onAuthStateChange:(handler)=>{subscriptions++;listener=handler;},
    signInWithPassword:async()=>{listener("SIGNED_IN",{user});return {data:{session:{user}}};}
  }};
  const context=vm.createContext({URL,Set,console,CustomEvent:class{},document:{dispatchEvent(){}},
    OveruurtjeConfig:{authAccountUrl:"https://example.test/account.html"},
    OveruurtjeSupabase:{getClient:async()=>client}});
  vm.runInContext(await read("saas/authService.js"),context);
  await context.OveruurtjeAuth.ready;
  assert.ok(context.OveruurtjeAuth.getState().error);
  await context.OveruurtjeAuth.signIn("test@example.test","test");
  assert.equal(context.OveruurtjeAuth.getState().user.id,"paid-account");
  assert.equal(context.OveruurtjeAuth.getState().error,null);
  assert.equal(subscriptions,1);
});

async function sessionFixture({profile=null,load=async()=>({isPro:true}),state={user:{id:"a"}}}={}) {
  const source=await read("saas/sessionUi.js");
  const implementation=source.slice(source.indexOf("  async function buildContextOnce("),source.indexOf("  async function submitAuth("));
  const notices=[];const rendered=[];
  const context=vm.createContext({
    contextGeneration:0,contextBuildPromise:null,contextBuildKey:"",currentContext:{auth:{user:null},profile:null},
    hasResolvedReady:false,contextPromiseResolve(){},expiredTrialNoticeHandled:false,
    auth:{getState:()=>state},state,
    handlePasswordRecovery(){},handlePasswordResetNotice(){},requireMfaVerification:async()=>true,
    readCachedProfile:()=>profile,loadFreshProfile:load,cacheProfile(){},
    subscriptions:{resolve:(value)=>({isPro:Boolean(value?.isPro)})},
    renderHeader:(value)=>rendered.push(value),showSessionNotice:(message)=>notices.push(message),revealSessionUi(){},
    document:{dispatchEvent(){}},CustomEvent:class {},console:{warn(){}},setTimeout
  });
  vm.runInContext(implementation,context);
  return {context,notices,rendered};
}

test("profielstoring blijft zichtbaar en opnieuw controleren herstelt betaald Pro", async()=>{
  let fail=true;
  const {context,notices}=await sessionFixture({load:async()=>{if(fail)throw new Error("network");return {isPro:true,avatarUrl:"photo.jpg"};}});
  await context.buildContext(context.state);
  assert.equal(context.currentContext.profileError,true);
  assert.match(notices.at(-1),/profiel en abonnement/);
  fail=false;
  await context.buildContext(context.state);
  assert.equal(context.currentContext.isPro,true);
  assert.equal(context.currentContext.profile.avatarUrl,"photo.jpg");
  assert.equal(context.currentContext.profileError,false);
});

test("een later binnenkomend profiel schakelt van Free naar Pro", async()=>{
  const {context}=await sessionFixture({profile:{isPro:false}});
  await context.buildContext(context.state);
  await Promise.resolve();
  assert.equal(context.currentContext.isPro,true);
});

test("profiel van uitgelogde gebruiker kan een nieuwere gaststatus niet overschrijven", async()=>{
  let resolve;
  const pending=new Promise(done=>{resolve=done;});
  const {context}=await sessionFixture({profile:{isPro:false},load:()=>pending});
  await context.buildContext(context.state);
  context.state.user=null;
  await context.buildContext(context.state);
  resolve({isPro:true});
  await Promise.resolve();
  assert.equal(context.currentContext.auth.user,null);
});
