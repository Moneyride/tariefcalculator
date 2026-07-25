import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testsDirectory, "../..");

async function runService(relativePath, values = {}) {
  const source = await readFile(path.join(rootDirectory, relativePath), "utf8");
  const context = vm.createContext({ console, ...values });
  vm.runInContext(source, context);
  return context;
}

test("accountinstellingen gebruiken een stabiel databasecontract", async () => {
  const context = await runService("app/saas/settingsService.js", {
    OveruurtjeSupabase: { getClient: async () => null }
  });

  const serialized = context.OveruurtjeSettings.serialize("user-1", {
    defaultDepartment: "audio",
    defaultDayRate: 525,
    defaultRateMode: "hour",
    defaultHourlyRate: 62.5,
    defaultBreakMinutes: 30,
    enableBreak: true,
    normalDayHours: 12,
    enableHalfDayUnder6Hours: true,
    enableOvertime10To12: true,
    enableOvertimeFrom12: false,
    enableOvertimeFrom14: true,
    enableNightTariff: true,
    nightStart: "23:00",
    nightEnd: "07:00",
    mileageRate: 0.35,
    parkingDefaultAmount: 12.5,
    droneVisible: true,
    roninVisible: false,
    droneTariffAmount: 65,
    roninTariffAmount: 80
  });

  assert.equal(serialized.user_id, "user-1");
  assert.equal(serialized.default_department, "audio");
  assert.equal(serialized.default_day_rate, 525);
  assert.equal(serialized.preferences.defaultRateMode, "hour");
  assert.equal(serialized.preferences.defaultHourlyRate, 62.5);
  assert.equal(serialized.preferences.defaultBreakMinutes, 30);
  assert.equal(serialized.preferences.enableBreak, true);
  assert.equal(serialized.preferences.normalDayHours, 12);
  assert.equal(serialized.preferences.enableHalfDayUnder6Hours, true);
  assert.equal(serialized.preferences.enableOvertimeFrom12, false);
  assert.equal(serialized.preferences.enableOvertimeFrom14, true);
  assert.equal(serialized.preferences.nightStart, "23:00");
  assert.equal(serialized.preferences.nightEnd, "07:00");
  assert.equal("parking_enabled" in serialized, false);
  assert.equal(serialized.drone_enabled, true);
  assert.equal(serialized.ronin_enabled, false);
  assert.equal(serialized.drone_tariff_amount, 65);
  assert.equal(serialized.ronin_tariff_amount, 80);
  assert.ok(serialized.updated_at);

  const normalized = context.OveruurtjeSettings.normalize(serialized);
  assert.equal(normalized.enableBreak, true);
  assert.equal(normalized.normalDayHours, 12);
  assert.equal(normalized.enableHalfDayUnder6Hours, true);
  assert.equal(normalized.enableOvertimeFrom12, false);
  assert.equal(normalized.enableOvertimeFrom14, true);
  assert.equal(normalized.enableNightTariff, true);
  assert.equal(normalized.nightStart, "23:00");
  assert.equal(normalized.nightEnd, "07:00");
});

test("feature gate laat Pro toe en meldt een upgrade voor Free", async () => {
  const events = [];
  class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  const context = await runService("app/saas/featureGate.js", {
    CustomEvent,
    document: { dispatchEvent: (event) => events.push(event) }
  });

  assert.equal(context.OveruurtjeFeatureGate.canUse("projects", { isPro: true }), true);
  assert.equal(context.OveruurtjeFeatureGate.canUse("workdays", { isPro: true }), true);
  assert.equal(context.OveruurtjeFeatureGate.canUse("work_functions", { isPro: true }), true);
  assert.equal(context.OveruurtjeFeatureGate.canUse("workday_sharing", { isPro: true }), true);
  assert.equal(context.OveruurtjeFeatureGate.canUse("work_functions", { isPro: false }), false);
  assert.equal(context.OveruurtjeFeatureGate.canUse("workday_sharing", { isPro: false }), false);
  assert.equal(context.OveruurtjeFeatureGate.canUse("workdays", { isPro: false }), false);
  assert.equal(context.OveruurtjeFeatureGate.canUse("pdf_export", { isPro: true }), true);
  assert.equal(context.OveruurtjeFeatureGate.canUse("pdf_export", { isPro: false }), false);
  assert.equal(context.OveruurtjeFeatureGate.require("projects", { isPro: false }), false);
  assert.equal(events[0].type, "overuurtje:pro-required");
  assert.equal(events[0].detail.feature, "projects");
});

test("subscription mock kan lokaal Free en Pro simuleren", async () => {
  const storage = new Map();
  class CustomEvent {
    constructor(type) { this.type = type; }
  }
  const context = await runService("app/saas/subscriptionService.js", {
    CustomEvent,
    document: { dispatchEvent: () => {} },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    window: { open: () => {} },
    OveruurtjeConfig: {
      allowMockSubscriptions: true,
      shopifyCheckoutUrl: "",
      shopifyManageUrl: ""
    }
  });

  assert.equal(context.OveruurtjeSubscriptions.resolve({ isPro: true }).isPro, false);
  context.OveruurtjeSubscriptions.setMockPlan("pro");
  assert.equal(context.OveruurtjeSubscriptions.resolve({ isPro: false }).isPro, true);
  assert.equal(context.OveruurtjeSubscriptions.canManage(), false);
});

test("SaaS-services laden voor calculatorcode en accountpagina is aanwezig", async () => {
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const sessionUiScript = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");

  assert.ok(calculatorHtml.indexOf("saas/authService.js") < calculatorHtml.indexOf("app.js"));
  assert.ok(calculatorHtml.indexOf("saas/functionService.js") < calculatorHtml.indexOf("app.js"));
  assert.ok(calculatorHtml.indexOf("saas/equipmentService.js") < calculatorHtml.indexOf("app.js"));
  assert.match(calculatorHtml, /id="account-login"/);
  assert.match(calculatorHtml, /data-workday-save-label/);
  assert.match(calculatorHtml, /Werkdag van vandaag opslaan|Bewaar je begintijd/);
  assert.match(calculatorHtml, /data-pro-badge/);
  assert.match(calculatorHtml, /name="rateMode"/);
  assert.match(calculatorHtml, /name="breakMinutes"/);
  assert.match(calculatorHtml, /name="enableBreak"/);
  assert.match(calculatorScript, /details\.hidden = hasAccount/);
  const projectCreateTag = calculatorHtml.match(/<a[^>]+id="project-create-link"[^>]*>/)?.[0] || "";
  assert.match(projectCreateTag, /is-pro-locked/);
  assert.doesNotMatch(projectCreateTag, /\shidden(?:\s|=|>)/);
  const droneOptionTag = calculatorHtml.match(/<div[^>]+id="drone-option"[^>]*>/)?.[0] || "";
  const roninOptionTag = calculatorHtml.match(/<div[^>]+id="ronin-option"[^>]*>/)?.[0] || "";
  assert.match(droneOptionTag, /is-pro-locked/);
  assert.match(roninOptionTag, /is-pro-locked/);
  assert.match(accountHtml, /Account &amp; instellingen/);
  assert.match(accountHtml, /name="defaultRateMode"/);
  assert.doesNotMatch(accountHtml, /name="defaultBreakMinutes"/);
  assert.match(accountHtml, /name="normalDayHours"/);
  assert.match(accountHtml, /name="enableBreak"/);
  assert.match(accountHtml, /name="enableOvertimeFrom14"/);
  assert.match(accountHtml, /id="compact-function-setting"/);
  assert.match(accountHtml, /id="account-function-select"/);
  assert.match(accountHtml, /id="add-function-button"/);
  assert.doesNotMatch(calculatorHtml, /id="calculator-function"/);
  assert.match(calculatorHtml, /id="active-function-name"/);
  assert.match(accountHtml, /name="nightStart"/);
  assert.match(accountHtml, /data-subscription-upgrade/);
  assert.match(calculatorScript, /planningBreakField\.hidden = !enabled/);
  assert.match(calculatorScript, /workFunction: selectedWorkFunction\(\)/);
  assert.match(calculatorScript, /applyWorkFunction\(snapshotFunction, \{ preserveRate: true \}\)/);
  assert.match(calculatorScript, /pdfProBadge\.hidden = context\.isPro/);
  assert.match(calculatorScript, /Werkdag van vandaag opslaan/);
  assert.match(sessionUiScript, /dialog\.id = "signup-confirmation-dialog"/);
  assert.match(sessionUiScript, /Controleer je inbox/);
  assert.match(sessionUiScript, /openSignupConfirmation\(email\)/);
  assert.match(sessionUiScript, /authEmail\.value = pendingSignupEmail/);
  const saveSettingsStart = calculatorScript.indexOf("function saveCurrentSettings()");
  const closeSettings = calculatorScript.indexOf("details.open = false", saveSettingsStart);
  const backgroundSync = calculatorScript.indexOf("void syncAccountSettings()", saveSettingsStart);
  assert.ok(saveSettingsStart >= 0 && closeSettings > saveSettingsStart);
  assert.ok(backgroundSync > closeSettings);
  assert.doesNotMatch(calculatorScript, /lockedEquipmentSettings/);
});

test("authfouten tonen nooit een leeg object aan de gebruiker", async () => {
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");

  assert.match(sessionUi, /function authErrorText/);
  assert.ok(sessionUi.includes('!["{}", "[object Object]"].includes'));
  assert.match(sessionUi, /De bevestigingsmail kon niet worden verstuurd/);
  assert.ok(sessionUi.includes("authStatus.textContent = authErrorText(error, authMode)"));
});

test("werkfuncties bewaren afdeling en een eigen dagtarief", async () => {
  const context = await runService("app/saas/functionService.js", {
    OveruurtjeSupabase: { getClient: async () => null }
  });
  const normalized = context.OveruurtjeFunctions.normalize({
    id: "function-1",
    user_id: "user-1",
    name: " Drone Operator ",
    department: "camera",
    day_rate: "575.00",
    is_default: true,
    sort_order: 2
  });

  assert.equal(normalized.name, "Drone Operator");
  assert.equal(normalized.department, "camera");
  assert.equal(normalized.dayRate, 575);
  assert.equal(normalized.isDefault, true);
  assert.equal(normalized.sortOrder, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.OveruurtjeFunctions.standardFunctions)),
    [
      { name: "Camera", department: "camera", dayRate: 450, sortOrder: 0 },
      { name: "Audio", department: "audio", dayRate: 395, sortOrder: 1 }
    ]
  );
  assert.equal(context.OveruurtjeFunctions.isStandard({ name: "Camera" }), true);
  assert.equal(context.OveruurtjeFunctions.isStandard({ name: "Audio" }), true);
  assert.equal(context.OveruurtjeFunctions.isStandard({ name: "Drone Operator" }), false);
});

test("Supabase-schema beveiligt profiel- en settingsdata met RLS", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607210001_saas_foundation.sql"),
    "utf8"
  );

  assert.match(migration, /alter table public\.profiles enable row level security/i);
  assert.match(migration, /alter table public\.settings enable row level security/i);
  assert.match(migration, /revoke update on table public\.profiles from authenticated/i);
  assert.match(migration, /grant update \(display_name\) on table public\.profiles/i);
  assert.match(migration, /auth\.uid\(\)\) = user_id/i);
});

test("abonnementsperiode blijft server-side beheerd en is zichtbaar in het account", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607220003_subscription_period.sql"),
    "utf8"
  );
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");

  assert.match(migration, /subscription_current_period_end timestamptz/i);
  assert.match(migration, /subscription_cancel_at_period_end boolean/i);
  assert.doesNotMatch(migration, /grant update/i);
  assert.match(accountHtml, /id="account-subscription-period"/);
  assert.match(accountHtml, /id="account-subscription-stop"[^>]+data-subscription-manage/);
});

test("vervolgmigration bewaart een dagtarief en verwijdert de parkeer-toggle", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607210002_day_rate_settings.sql"),
    "utf8"
  );

  assert.match(migration, /rename column default_hourly_rate to default_day_rate/i);
  assert.match(migration, /set default_day_rate = default_day_rate \* 10/i);
  assert.match(migration, /drop column parking_enabled/i);
});

test("apparatuurmigration maakt vaste Pro-toeslagen eigenaargebonden", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607220001_equipment.sql"),
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.equipment/i);
  assert.match(migration, /alter table public\.equipment enable row level security/i);
  assert.match(migration, /auth\.uid\(\)\) = user_id/i);
  assert.match(migration, /drone_tariff_amount/i);
});

test("functiemigration maakt functies met dagtarieven Pro-gebonden", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607250001_work_functions.sql"),
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.work_functions/i);
  assert.match(migration, /department in \('camera', 'audio'\)/i);
  assert.match(migration, /day_rate numeric/i);
  assert.match(migration, /alter table public\.work_functions enable row level security/i);
  assert.match(migration, /public\.current_user_is_pro\(\)/i);
  assert.match(migration, /unique index if not exists work_functions_one_default_per_user_idx/i);
});

test("projectmigration beveiligt projecten en werkdagen voor Pro-gebruikers", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607220002_projects.sql"),
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.projects/i);
  assert.match(migration, /create table if not exists public\.project_days/i);
  assert.match(migration, /calculation_data jsonb/i);
  assert.match(migration, /alter table public\.projects enable row level security/i);
  assert.match(migration, /alter table public\.project_days enable row level security/i);
  assert.match(migration, /current_user_is_pro\(\)/i);
});

test("projectpagina hergebruikt de calculator en projectsservice", async () => {
  const html = await readFile(path.join(rootDirectory, "app/projects.html"), "utf8");
  const script = await readFile(path.join(rootDirectory, "app/projects.js"), "utf8");
  assert.ok(html.indexOf("saas/projectService.js") < html.indexOf("projects.js"));
  assert.ok(html.indexOf("saas/functionService.js") < html.indexOf("projects.js"));
  assert.ok(html.indexOf("calculator.js") < html.indexOf("projects.js"));
  assert.doesNotMatch(html, /name="workFunctionId"/);
  assert.match(script, /workFunctionName/);
  assert.match(html, /id="project-pdf"/);
  assert.match(html, /Vul hier bijzonderheden in/);
  assert.match(html, /id="calendar-grid"/);
  assert.match(html, /id="calendar-weekdays-only"/);
  assert.match(html, /id="carousel-previous"/);
  assert.match(html, /id="carousel-next"/);
  assert.match(html, /id="copy-day-invoice"/);
  assert.match(html, /class="day-copy-panel"/);
  assert.match(script, /selectedWorkdays = new Set/);
  assert.match(script, /scrollBy\(\{ left:/);
  assert.match(script, /function buildDayInvoiceSummary/);
  assert.match(script, /Factuurtekst gekopieerd/);
  assert.match(script, /parameters\.get\("day"\)/);
  assert.match(script, /openProject\(requested, requestedDay\)/);
});

test("Werkdagen bewaren versieerbare calculatorsnapshots met Pro-RLS", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607240002_workdays.sql"),
    "utf8"
  );
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const workdaysHtml = await readFile(path.join(rootDirectory, "app/workdays.html"), "utf8");
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");

  assert.match(migration, /create table if not exists public\.workdays/i);
  assert.match(migration, /calculation_data jsonb/i);
  assert.match(migration, /alter table public\.workdays enable row level security/i);
  assert.match(migration, /current_user_is_pro\(\)/i);
  assert.doesNotMatch(migration, /unique\s*\([^)]*work_date/i);
  assert.ok(calculatorHtml.indexOf("saas/projectService.js") < calculatorHtml.indexOf("app.js"));
  assert.ok(calculatorHtml.indexOf("saas/workdayService.js") < calculatorHtml.indexOf("app.js"));
  assert.match(calculatorHtml, /id="save-workday"/);
  assert.match(calculatorHtml, /id="duplicate-workday-dialog"/);
  assert.match(calculatorHtml, /id="today-workday-dialog"/);
  assert.match(calculatorScript, /function buildWorkdaySnapshot/);
  assert.match(calculatorScript, /function listExistingDateEntries/);
  assert.match(calculatorScript, /projectService\.listDaysByDate/);
  assert.match(calculatorScript, /function projectDayUrl/);
  assert.match(calculatorScript, /sessionStorage\.getItem\(promptKey\)/);
  assert.match(workdaysHtml, /<h1>Werkdagen<\/h1>/);
  assert.match(accountHtml, /id="account-workday-list"/);
  assert.doesNotMatch(accountHtml, />Historie</);
});

test("Werkdagenservice ondersteunt meerdere werkdagen op dezelfde datum", async () => {
  const storage = new Map();
  const context = await runService("app/saas/workdayService.js", {
    crypto: { randomUUID: (() => { let id = 0; return () => `workday-${++id}`; })() },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    OveruurtjeSupabase: { getClient: async () => null }
  });
  const service = context.OveruurtjeWorkdays;
  await service.save("user-1", { workDate: "2026-07-24", calculationData: { startTime: "08:00", endTime: "" } }, { mock: true });
  await service.save("user-1", { workDate: "2026-07-24", calculationData: { startTime: "18:00", endTime: "22:00" } }, { mock: true });
  const sameDate = await service.listByDate("user-1", "2026-07-24", { mock: true });
  assert.equal(sameDate.length, 2);
  assert.equal(sameDate.some((item) => item.calculationData.endTime === ""), true);
  assert.equal(sameDate.some((item) => item.calculationData.endTime === "22:00"), true);
});

test("Projectservice vindt een geselecteerde projectdag op datum", async () => {
  const storage = new Map();
  const context = await runService("app/saas/projectService.js", {
    crypto: { randomUUID: (() => { let id = 0; return () => `project-item-${++id}`; })() },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    OveruurtjeSupabase: { getClient: async () => null }
  });
  const service = context.OveruurtjeProjects;
  const project = await service.saveProject("user-1", {
    name: "Testproject",
    startDate: "2026-07-20",
    endDate: "2026-07-30"
  }, { mock: true });
  await service.replaceDays("user-1", project.id, [{
    workDate: "2026-07-25",
    calculationData: { startTime: "08:00", endTime: "18:00" }
  }], { mock: true });

  const matches = await service.listDaysByDate("user-1", "2026-07-25", { mock: true });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].project.name, "Testproject");
  assert.equal(matches[0].day.workDate, "2026-07-25");
});

test("Werkdagen delen gebruikt verwijzingen, redacted RPCs en ontvanger-RLS", async () => {
  const foundationMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607250002_workday_sharing.sql"),
    "utf8"
  );
  const inviteMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607250003_workday_share_invites.sql"),
    "utf8"
  );
  const workdaysHtml = await readFile(path.join(rootDirectory, "app/workdays.html"), "utf8");
  const projectsHtml = await readFile(path.join(rootDirectory, "app/projects.html"), "utf8");
  const indexHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");

  assert.match(foundationMigration, /create table if not exists public\.workday_shares/i);
  assert.match(foundationMigration, /create table if not exists public\.notifications/i);
  assert.match(foundationMigration, /workday_id uuid references public\.workdays/i);
  assert.match(foundationMigration, /project_day_id uuid references public\.project_days/i);
  assert.match(foundationMigration, /workday_shares_one_source/i);
  assert.match(foundationMigration, /alter table public\.workday_shares enable row level security/i);
  assert.match(foundationMigration, /recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(foundationMigration, /create or replace function public\.get_received_workday_shares/i);
  assert.match(inviteMigration, /create table if not exists public\.workday_share_invites/i);
  assert.match(inviteMigration, /token uuid not null unique/i);
  assert.match(inviteMigration, /create or replace function public\.create_workday_share_invite/i);
  assert.match(inviteMigration, /create or replace function public\.preview_workday_share_invite/i);
  assert.match(inviteMigration, /grant execute on function public\.preview_workday_share_invite\(text\) to anon, authenticated/i);
  assert.match(inviteMigration, /create or replace function public\.claim_workday_share_invite/i);
  assert.match(inviteMigration, /drop function if exists public\.search_overuurtje_users/i);
  assert.match(inviteMigration, /drop function if exists public\.share_workday_with_users/i);
  assert.match(inviteMigration, /sync_shared_workday_times/i);
  assert.match(inviteMigration, /workday_times_updated/i);
  assert.match(workdaysHtml, /id="received-workdays"/);
  assert.match(workdaysHtml, /id="shared-invite-dialog"/);
  assert.match(workdaysHtml, /id="take-over-shared-times"/);
  assert.match(projectsHtml, /id="share-project-day"/);
  assert.match(indexHtml, /id="share-current-workday"/);
  assert.ok(indexHtml.indexOf("saas/shareService.js") < indexHtml.indexOf("saas/sessionUi.js"));
});

test("Deelservice maakt een uitnodiging zonder gebruikerszoekopdracht of financiële data", async () => {
  const calls = [];
  const context = await runService("app/saas/shareService.js", {
    OveruurtjeSupabase: {
      getClient: async () => ({
        rpc: async (name, values) => {
          calls.push({ name, values });
          return { data: [], error: null };
        }
      })
    }
  });

  await context.OveruurtjeShares.createInvite({
    sourceType: "workday",
    sourceId: "workday-1",
    message: "Controleer de eindtijd.",
    shareMode: "direct"
  });

  assert.equal(calls[0].name, "create_workday_share_invite");
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls[0].values)),
    {
      p_source_type: "workday",
      p_source_id: "workday-1",
      p_message: "Controleer de eindtijd.",
      p_share_mode: "direct"
    }
  );
  assert.equal(JSON.stringify(calls[0]).includes("email"), false);
  assert.equal(JSON.stringify(calls[0]).includes("recipient"), false);
  assert.equal(JSON.stringify(calls[0]).includes("rate"), false);
  assert.equal(JSON.stringify(calls[0]).includes("amount"), false);
});

test("Gratis ontvangers nemen gedeelde tijden over in de reguliere calculator", async () => {
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");

  assert.match(
    workdaysScript,
    /if \(!currentContext\.isPro && inviteCanBeImported\)\s*\{\s*await openSharedTimesInCalculator/
  );
  assert.match(
    workdaysScript,
    /sessionStorage\.setItem\(\s*"overuurtjeSharedTimesImport"/
  );
  assert.match(workdaysScript, /location\.href = "index\.html\?sharedTimes=1"/);
  assert.doesNotMatch(
    workdaysScript,
    /if \(!currentContext\.isPro && inviteCanBeImported\)[\s\S]{0,300}workdayService\.save/
  );
});

test("Projectdagen behouden hun id zodat deelrelaties niet verdwijnen bij opslaan", async () => {
  const service = await readFile(path.join(rootDirectory, "app/saas/projectService.js"), "utf8");
  const projectScript = await readFile(path.join(rootDirectory, "app/projects.js"), "utf8");
  assert.match(service, /\.upsert\(payload, \{ onConflict: "id" \}\)/);
  assert.doesNotMatch(service, /from\("project_days"\)\.delete\(\)\.eq\("project_id", projectId\).*if \(days\.length\)/s);
  assert.match(projectScript, /id: existing\.get\(workDate\)\?\.id \|\| null/);
});

test("Auth-mails zijn plakklare templates zonder zichtbare metadata of dubbele bevestiging", async () => {
  const templateNames = [
    "change-email.html",
    "confirm-signup.html",
    "email-changed.html",
    "identity-linked.html",
    "identity-removed.html",
    "invite-user.html",
    "magic-link.html",
    "mfa-added.html",
    "mfa-removed.html",
    "password-changed.html",
    "phone-changed.html",
    "reauthentication.html",
    "reset-password.html"
  ];

  for (const templateName of templateNames) {
    const template = await readFile(
      path.join(rootDirectory, "supabase/email-templates", templateName),
      "utf8"
    );
    assert.equal(template.trimStart().startsWith("<!--"), false, `${templateName} bevat zichtbare metadata`);
    assert.equal(template.includes("Flow:"), false, `${templateName} bevat zichtbare flowtekst`);
  }

  const confirmationTemplate = await readFile(
    path.join(rootDirectory, "supabase/email-templates/confirm-signup.html"),
    "utf8"
  );
  assert.equal((confirmationTemplate.match(/>Bevestig je account</g) || []).length, 1);
  assert.equal((confirmationTemplate.match(/>Account bevestigen</g) || []).length, 1);
  assert.equal(
    (confirmationTemplate.match(/Overuurtje\.nl is een dienst van The GearHarbor\./g) || []).length,
    1
  );
});
