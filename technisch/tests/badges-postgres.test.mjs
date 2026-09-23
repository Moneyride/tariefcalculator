import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// The production SQL itself runs in an isolated, in-memory PostgreSQL database.
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const migration = async (name) => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

test("alle badgevoorwaarden, toekenning, selectie en notificaties in PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table profiles(id uuid primary key references auth.users, display_name text, avatar_url text, created_at timestamptz default now());
      create table workdays(id uuid primary key default gen_random_uuid(), user_id uuid, work_date date, calculation_data jsonb);
      create table projects(id uuid primary key default gen_random_uuid(), user_id uuid);
      create table project_days(id uuid primary key default gen_random_uuid(), project_id uuid, user_id uuid, work_date date, calculation_data jsonb);
      create table workday_shares(id uuid primary key default gen_random_uuid(), owner_id uuid, recipient_id uuid, workday_id uuid, project_day_id uuid, accepted_at timestamptz);
      create table notifications(recipient_id uuid, actor_id uuid, notification_type text, source_id uuid);
    `);
    await db.exec(await migration("202608090001_crew_cards_and_badges"));
    await t.test("oude evaluator reproduceert de blokkerende SQL-fout", async () => {
      const id = randomUUID();
      await db.query("insert into auth.users values($1)", [id]);
      await db.query("insert into profiles(id) values($1)", [id]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await assert.rejects(db.query("select * from evaluate_my_badges()"), /column reference "earned_at" is ambiguous/);
      await db.exec("select set_config('request.jwt.claim.sub','',false)");
    });
    const cards = await migration("202608090002_crew_card_profiles");
    await db.exec(cards.slice(cards.indexOf("create table if not exists public.user_featured_badges"), cards.indexOf("create or replace function public.crew_card_json")));
    await db.exec(await migration("202608090005_badge_notifications"));
    await db.exec(await migration("202608100001_badge_awarding_repair"));
    const repair = await migration("202609220001_badge_rules_audit");
    await db.exec(repair);
    await db.exec(repair); // Rerunning is safe.

    const login = (id = "") => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    async function user(created = "2026-07-02T12:00:00Z") {
      await login();
      const id = randomUUID();
      await db.query("insert into auth.users values ($1)", [id]);
      await db.query("insert into profiles(id,display_name,created_at) values ($1,'Test',$2)", [id, created]);
      return id;
    }
    async function day(id, date = "2025-08-01", data = {}, project = null) {
      const value = { startTime: "08:00", endTime: "18:00", ...data };
      const result = project
        ? await db.query("insert into project_days(user_id,project_id,work_date,calculation_data) values($1,$2,$3,$4) returning id", [id,project,date,value])
        : await db.query("insert into workdays(user_id,work_date,calculation_data) values($1,$2,$3) returning id", [id,date,value]);
      return result.rows[0].id;
    }
    async function project(id) {
      return (await db.query("insert into projects(user_id) values($1) returning id", [id])).rows[0].id;
    }
    async function keys(id) {
      return new Set((await db.query("select key from badge_eligible_keys($1)", [id])).rows.map((r) => r.key));
    }
    async function share(owner, recipient, source = randomUUID()) {
      await db.query("insert into workday_shares(owner_id,recipient_id,workday_id,accepted_at) values($1,$2,$3,now())", [owner,recipient,source]);
    }

    await t.test("toekomstige of lege dagen verdienen geen werkdag- of kalenderbadges", async () => {
      const id = await user();
      await day(id, "2099-12-25", { startTime: "04:00" });
      await day(id, "2025-12-31", { startTime: "", endTime: "" });
      assert.deepEqual([...await keys(id)], ["launch_crew"]);
      assert.equal((await db.query("select count(*)::int n from user_badges where user_id=$1", [id])).rows[0].n, 0);
    });
    await t.test("eerste productie automatisch, inclusief reisdag zonder tijden; open/future dag blokkeert", async () => {
      const id = await user(); const p = await project(id);
      await day(id, "2025-08-01", {}, p);
      const open = await day(id, "2025-08-02", { endTime: "" }, p);
      assert.equal((await keys(id)).has("eerste_productie"), false);
      await db.query("update project_days set calculation_data=$1 where id=$2", [{ enableTravelDay:true, travelRegion:"outside_europe" },open]);
      assert.equal((await keys(id)).has("eerste_productie"), true);
      await day(id, "2099-08-03", {}, p);
      assert.equal((await keys(id)).has("eerste_productie"), false);
    });
    await t.test("alle 28 data- en activiteitsbadges kunnen worden ontgrendeld", async () => {
      const id = await user(); const p = await project(id);
      await db.query(`insert into workdays(user_id,work_date,calculation_data)
        select $1, date '2022-01-01' + i, '{"startTime":"04:00","endTime":"01:00","extras":{"enableKilometers":true,"kilometers":20}}'::jsonb
        from generate_series(0,499) i`, [id]);
      for (let i=1;i<=10;i++) await day(id, `2025-08-${String(i).padStart(2,"0")}`, { startTime:"",endTime:"",enableTravelDay:true,travelRegion:"outside_europe" }, p);
      await day(id,"2024-12-31",{startTime:"08:00",endTime:"01:00"});
      const owner = await user();
      await share(owner,id);
      for(let i=0;i<10;i++) await share(id,await user());
      const colleague = await user();
      for(let i=0;i<25;i++) await share(id,colleague);
      await db.query("insert into user_activity_events(user_id,event_key) select $1,'calculator_calculated' from generate_series(1,100)", [id]);
      await db.query("insert into user_activity_events(user_id,event_key) values($1,'pdf_generated')",[id]);
      const actual = await keys(id);
      const expected = (await db.query("select key from badges where key not in ('jubileum','launch_crew')")).rows.map(r=>r.key);
      for(const key of expected) assert.ok(actual.has(key), `missing ${key}`);
    });
    await t.test("jubileum en beide grenzen van Launch Crew", async () => {
      assert.ok((await keys(await user("2020-01-01T00:00:00Z"))).has("jubileum"));
      assert.equal((await keys(await user("2026-06-30T21:59:59Z"))).has("launch_crew"),false);
      assert.ok((await keys(await user("2026-06-30T22:00:00Z"))).has("launch_crew"));
      assert.ok((await keys(await user("2027-06-30T21:59:59Z"))).has("launch_crew"));
      assert.equal((await keys(await user("2027-06-30T22:00:00Z"))).has("launch_crew"),false);
    });
    await t.test("reizen en kilometers werken in beide opslagformaten; uitgeschakelde kilometers tellen niet", async () => {
      for (const nested of [false,true]) {
        const id = await user();
        const extras = {enableTravelDay:true,travelRegion:"outside_europe",enableKilometers:false,kilometers:10000};
        const source = await day(id,"2025-08-01",{startTime:"",endTime:"",...(nested?{extras}:extras)});
        assert.ok((await keys(id)).has("buitenlandklus"));
        assert.equal((await keys(id)).has("road_warrior"),false);
        extras.enableKilometers=true;
        await db.query("update workdays set calculation_data=$1 where id=$2", [nested?{extras}:extras,source]);
        assert.ok((await keys(id)).has("road_warrior"));
      }
    });
    await t.test("tijdgrenzen, ontbrekende tijden en ongeldige oude gegevens", async () => {
      const id=await user();
      const source=await day(id,"2025-12-31",{startTime:"06:00",endTime:""});
      assert.equal((await keys(id)).has("first_call"),false);
      assert.equal((await keys(id)).has("new_years_crew"),false);
      await db.query("update workdays set calculation_data=$1 where id=$2",[{startTime:"08:00",endTime:"00:00"},source]);
      assert.equal((await keys(id)).has("nachtraaf"),false);
      await db.query("update workdays set calculation_data=$1 where id=$2",[{startTime:"08:00",endTime:"01:00"},source]);
      assert.ok((await keys(id)).has("nachtraaf"));
      assert.ok((await keys(id)).has("new_years_crew"));
      assert.ok((await keys(id)).has("geen_negen_tot_vijf"));
      await day(id,"2025-01-01",{startTime:"99:99",endTime:"bad",extras:{enableKilometers:true,kilometers:"bad"}});
      await keys(id); // Malformed historical data cannot abort all thirty checks.
    });
    await t.test("week telt verschillende dagen, niet vijf klussen op dezelfde dag", async () => {
      const id=await user();
      for(let i=0;i<5;i++) await day(id,"2025-08-04");
      assert.equal((await keys(id)).has("volle_week"),false);
      for(let i=5;i<=8;i++) await day(id,`2025-08-0${i}`);
      assert.ok((await keys(id)).has("volle_week"));
    });
    await t.test("collega's onderling tellen mee en dubbele uitnodigingen tellen niet dubbel", async () => {
      const id=await user(); const owner=await user(); const other=await user(); const source=randomUUID();
      for(let i=0;i<25;i++){ await share(owner,id,source); await share(owner,other,source); }
      assert.equal((await keys(id)).has("vaste_crew"),false);
      for(let i=0;i<24;i++){ const s=randomUUID(); await share(owner,id,s); await share(owner,other,s); }
      assert.ok((await keys(id)).has("vaste_crew"));
    });
    await t.test("PDF van werkdag en project tellen beide; dubbele events blijven begrensd", async () => {
      for(const event of ["pdf_generated","project_pdf_generated"]){
        const id=await user(); await login(id);
        await db.query("select * from record_badge_activity($1)",[event]);
        await db.query("select * from record_badge_activity($1)",[event]);
        assert.ok((await keys(id)).has("paperwork_hero"));
        assert.equal((await db.query("select count(*)::int n from user_activity_events where user_id=$1",[id])).rows[0].n,1);
      }
    });
    await t.test("toekenning direct bij opslaan, eenmalige notificatie en selecteerbare titelbadge", async () => {
      const id=await user(); await login(id); await day(id);
      await db.exec("select * from evaluate_my_badges(); select * from evaluate_my_badges();");
      const rows=(await db.query("select * from list_my_badges() where key='eerste_draaidag'")).rows;
      assert.ok(rows[0].earned_at);
      await db.query("select set_my_crew_badges($1,$2)",[["eerste_draaidag"],"eerste_draaidag"]);
      assert.ok((await db.query("select is_title from list_my_badges() where key='eerste_draaidag'")).rows[0].is_title);
      assert.equal((await db.query("select count(*)::int n from notifications where recipient_id=$1 and source_id=(select id from badges where key='eerste_draaidag')",[id])).rows[0].n,1);
      await assert.rejects(db.query("select set_my_crew_badges($1,$2)",[["setlegende"],"setlegende"]));
      await db.exec("set role authenticated");
      await assert.rejects(db.query("select * from badge_eligible_keys($1)",[id]));
      await db.exec("reset role");
    });
  } finally { await db.close(); }
});
