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
    minimumHours: 6,
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
    roninTariffAmount: 80,
    frequentClients: ["KLM", " klm ", "NPO"]
  });

  assert.equal(serialized.user_id, "user-1");
  assert.equal(serialized.default_department, "audio");
  assert.equal(serialized.default_day_rate, 525);
  assert.equal(serialized.preferences.defaultRateMode, "hour");
  assert.equal(serialized.preferences.defaultHourlyRate, 62.5);
  assert.equal(serialized.preferences.defaultBreakMinutes, 30);
  assert.equal(serialized.preferences.enableBreak, true);
  assert.equal(serialized.preferences.normalDayHours, 12);
  assert.equal(serialized.preferences.minimumHours, 6);
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
  assert.deepEqual(Array.from(serialized.preferences.frequentClients), ["KLM", "NPO"]);
  assert.ok(serialized.updated_at);

  const normalized = context.OveruurtjeSettings.normalize(serialized);
  assert.equal(normalized.enableBreak, true);
  assert.equal(normalized.normalDayHours, 12);
  assert.equal(normalized.minimumHours, 6);
  assert.equal(normalized.enableHalfDayUnder6Hours, true);
  assert.equal(normalized.enableOvertimeFrom12, false);
  assert.equal(normalized.enableOvertimeFrom14, true);
  assert.equal(normalized.enableNightTariff, true);
  assert.equal(normalized.nightStart, "23:00");
  assert.equal(normalized.nightEnd, "07:00");
  assert.deepEqual(Array.from(normalized.frequentClients), ["KLM", "NPO"]);
});

test("opdrachtgevers en snelle werkdagnamen zijn op alle relevante schermen beschikbaar", async () => {
  const [calculatorHtml, projectHtml, accountHtml, calculatorScript] = await Promise.all([
    readFile(path.join(rootDirectory, "app/index.html"), "utf8"),
    readFile(path.join(rootDirectory, "app/projects.html"), "utf8"),
    readFile(path.join(rootDirectory, "app/account.html"), "utf8"),
    readFile(path.join(rootDirectory, "app/app.js"), "utf8")
  ]);

  assert.match(calculatorHtml, /name="clientName"/);
  assert.match(calculatorHtml, /id="client-name-suggestions"/);
  assert.match(calculatorHtml, /id="workday-name-suggestions"/);
  assert.match(calculatorHtml, /data-print-row="clientName"/);
  assert.match(projectHtml, /id="project-client-suggestions"/);
  assert.doesNotMatch(calculatorHtml, /id="save-client-name"/);
  assert.doesNotMatch(projectHtml, /id="save-project-client"/);
  assert.match(accountHtml, /id="account-client-list"/);
  assert.match(accountHtml, /id="account-enable-notifications"/);
  assert.match(calculatorScript, /clientName:\s*String\(form\.elements\.namedItem\("clientName"\)/);
  assert.match(calculatorScript, /rememberCurrentClient\(\)/);
});

test("accountinstellingen bewaren geen minimale afname als nul", async () => {
  const context = await runService("app/saas/settingsService.js", {
    OveruurtjeSupabase: { getClient: async () => null }
  });

  const serialized = context.OveruurtjeSettings.serialize("user-1", { minimumHours: 0 });
  const normalized = context.OveruurtjeSettings.normalize({ preferences: { minimumHours: 0 } });

  assert.equal(serialized.preferences.minimumHours, 0);
  assert.equal(normalized.minimumHours, 0);
});

test("functies bewaren een uitbreidbare calculatorpreset", async () => {
  const context = await runService("app/saas/functionService.js", {
    OveruurtjeSupabase: { getClient: async () => null }
  });
  const normalized = context.OveruurtjeFunctions.normalize({
    id: "function-1",
    user_id: "user-1",
    name: "Drone Operator",
    department: "camera",
    day_rate: 575,
    is_default: true,
    sort_order: 2,
    calculation_settings: {
      settings: { normalDayHours: 12, enableNightTariff: true },
      extras: { enableDroneTariff: true }
    }
  });
  assert.equal(normalized.calculationSettings.settings.normalDayHours, 12);
  assert.equal(normalized.calculationSettings.extras.enableDroneTariff, true);

  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607280001_work_function_settings.sql"),
    "utf8"
  );
  assert.match(migration, /add column if not exists calculation_settings jsonb/i);
});

test("delen gebruikt alleen een directe uitnodigingslink en ondersteunt QR", async () => {
  const shareUi = await readFile(path.join(rootDirectory, "app/saas/shareUi.js"), "utf8");
  const shareLanding = await readFile(path.join(rootDirectory, "app/delen.html"), "utf8");
  assert.match(shareUi, /navigator\.share\(\{ url \}\)/);
  assert.match(shareUi, /new URL\("delen\.html", location\.href\)/);
  assert.match(shareUi, /searchParams\.set\("type", activeSource\?\.type === "project" \? "project" : "workday"\)/);
  assert.match(shareUi, /message: ""/);
  assert.match(shareUi, /shareMode: "direct"/);
  assert.match(shareUi, /loopt live mee tot de eindtijd is opgeslagen/);
  assert.match(shareUi, /data-share-qr/);
  assert.match(shareUi, /globalThis\.qrcode/);
  assert.doesNotMatch(shareUi, /name="shareMode"/);
  assert.doesNotMatch(shareUi, /data-share-message/);
  assert.match(shareLanding, /property="og:image" content="https:\/\/overuurtje\.nl\/overuurtje-logo\.png/);
  assert.match(shareLanding, /location\.replace\(destination\.href\)/);
  assert.match(shareLanding, /sourceType === "project" \? "projects\.html" : "workdays\.html"/);
});

test("berekenen blijft de hoofdactie en bewaren staat onderaan voor het resultaat", async () => {
  const html = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const result = html.indexOf('class="result-panel"');
  const actions = html.indexOf('class="footer-actions"');
  const calculate = html.indexOf('id="recalculate"');
  const newCalculation = html.indexOf('id="new-calculation"');
  const saveWorkday = html.indexOf('id="save-workday"');
  assert.ok(result >= 0 && actions > result);
  assert.ok(calculate >= 0 && newCalculation > calculate && saveWorkday > newCalculation && saveWorkday < result);
  assert.match(html, /class="invoice-copy-button"[^>]+id="copy-summary"/);
  assert.match(html, /id="save-workday"/);
  assert.doesNotMatch(html, /id="share-current-workday"/);
  assert.doesNotMatch(html, /id="share-site"/);
});

test("opslaan en PDF gebruiken consistente lijniconen zonder PDF-lettermerk", async () => {
  const html = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const styles = await readFile(path.join(rootDirectory, "app/styles.css"), "utf8");
  const saveButton = html.match(/<button class="workday-save-button[\s\S]*?<\/button>/)?.[0] || "";
  const pdfButton = html.match(/<button class="secondary pro-action-button"[^>]+id="save-pdf"[\s\S]*?<\/button>/)?.[0] || "";

  assert.match(saveButton, /class="button-line-icon"/);
  assert.match(saveButton, /M5 3h12l2 2v16H5z/);
  assert.match(pdfButton, /class="button-line-icon"/);
  assert.match(pdfButton, /M6 3h8l4 4v14H6z/);
  assert.doesNotMatch(pdfButton, /<svg[\s\S]*?>\s*PDF\s*</i);
  assert.match(styles, /\.button-line-icon\s*\{[\s\S]*stroke-width:\s*1\.8/);
});

test("feature gate houdt premium functies achter Pro en laat werkdag delen toe voor Free", async () => {
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
  assert.equal(context.OveruurtjeFeatureGate.canUse("workday_sharing", { isPro: false }), true);
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

  assert.equal(context.OveruurtjeSubscriptions.resolve({ isPro: true }).isPro, true);
  context.OveruurtjeSubscriptions.setMockPlan("free");
  assert.equal(context.OveruurtjeSubscriptions.resolve({ isPro: true }).isPro, false);
  context.OveruurtjeSubscriptions.setMockPlan("pro");
  assert.equal(context.OveruurtjeSubscriptions.resolve({ isPro: false }).isPro, true);
  assert.equal(context.OveruurtjeSubscriptions.canManage(), false);
});

test("een actieve trial telt als Pro, verloopt lokaal veilig en betaald Pro heeft voorrang", async () => {
  const context = await runService("app/saas/subscriptionService.js", {
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { dispatchEvent: () => {} },
    window: { open: () => {} },
    OveruurtjeConfig: {
      allowMockSubscriptions: false,
      shopifyCheckoutUrl: "",
      shopifyManageUrl: ""
    }
  });
  const future = new Date(Date.now() + (30 * 86400000)).toISOString();
  const past = new Date(Date.now() - 60000).toISOString();

  const active = context.OveruurtjeSubscriptions.resolve({
    isPro: false,
    trialStartedAt: new Date().toISOString(),
    trialEndsAt: future
  });
  assert.equal(active.isPro, true);
  assert.equal(active.isTrial, true);
  assert.equal(active.plan, "pro_trial");
  assert.equal(active.trialDaysRemaining, 30);

  const expired = context.OveruurtjeSubscriptions.resolve({
    isPro: false,
    trialStartedAt: "2026-01-01T00:00:00.000Z",
    trialEndsAt: past
  });
  assert.equal(expired.isPro, false);
  assert.equal(expired.isExpiredTrial, true);
  assert.equal(expired.plan, "expired_trial");

  const paid = context.OveruurtjeSubscriptions.resolve({
    isPro: true,
    trialStartedAt: "2026-01-01T00:00:00.000Z",
    trialEndsAt: past
  });
  assert.equal(paid.isPro, true);
  assert.equal(paid.isPaidPro, true);
  assert.equal(paid.isExpiredTrial, false);
  assert.equal(paid.plan, "pro");
});

test("trialmigratie geeft alleen nieuwe accounts exact 30 dagen en verwerkt rechten server-side", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608020001_pro_trials.sql"),
    "utf8"
  );

  assert.match(migration, /add column if not exists trial_started_at timestamptz/i);
  assert.match(migration, /add column if not exists trial_ends_at timestamptz/i);
  assert.match(migration, /trial_start \+ interval '30 days'/i);
  assert.match(migration, /on conflict \(id\) do nothing/i);
  assert.doesNotMatch(migration, /update public\.profiles[\s\S]{0,300}set[\s\S]{0,200}trial_started_at\s*=/i);
  assert.match(migration, /create or replace function public\.current_user_is_pro\(\)/i);
  assert.match(migration, /p\.trial_ends_at > now\(\)/i);
  assert.match(migration, /p\.is_pro\s+or/i);
  assert.match(migration, /create or replace function public\.process_pro_trial_transitions\(\)/i);
  assert.match(migration, /trial_reminder_sent_at is null/i);
  assert.match(migration, /trial_expired_at = coalesce/i);
  assert.match(migration, /'0 \* \* \* \*'/i);
  assert.doesNotMatch(migration, /'account'\s*,\s*id/i);
});

test("SaaS-services laden voor calculatorcode en accountpagina is aanwezig", async () => {
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const sessionUiScript = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");

  assert.ok(calculatorHtml.indexOf("saas/authService.js") < calculatorHtml.indexOf("app.js"));
  assert.ok(calculatorHtml.indexOf("saas/functionService.js") < calculatorHtml.indexOf("app.js"));
  assert.ok(calculatorHtml.indexOf("saas/equipmentService.js") < calculatorHtml.indexOf("app.js"));
  assert.ok(calculatorHtml.indexOf("saas/freeActiveWorkdayService.js") < calculatorHtml.indexOf("app.js"));
  assert.match(calculatorHtml, /id="account-login"/);
  assert.match(calculatorHtml, /data-workday-save-label/);
  assert.match(calculatorHtml, /Bewaar voor later/);
  assert.match(calculatorHtml, /data-pro-badge/);
  assert.match(calculatorScript, /const hasSharedRecipient = !isSharedReceiver/);
  assert.match(calculatorScript, /Opslaan werkt gedeelde tijden bij voor je collega's/);
  assert.match(calculatorScript, /Bewaar je eigen extra's en berekening bij deze gedeelde dag/);
  assert.match(calculatorHtml, /name="rateMode"/);
  assert.match(calculatorHtml, /name="breakMinutes"/);
  assert.match(calculatorHtml, /name="enableBreak"/);
  const workdayNameTag = calculatorHtml.match(/<label[^>]+id="workday-name-field"[^>]*>/)?.[0] || "";
  assert.doesNotMatch(workdayNameTag, /\shidden(?:\s|=|>)/);
  assert.match(calculatorScript, /workdayNameField\.hidden = isProjectDay/);
  const summaryStart = calculatorScript.indexOf("function buildSummary(result)");
  const summaryEnd = calculatorScript.indexOf("async function syncFreeSharedWorkdaySource", summaryStart);
  const invoiceSummarySource = calculatorScript.slice(summaryStart, summaryEnd);
  assert.match(invoiceSummarySource, /Werkdag:/);
  assert.doesNotMatch(invoiceSummarySource, /Opdrachtgever:/);
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
  assert.match(accountHtml, /id="subscription-monthly-price"/);
  assert.match(accountHtml, /id="subscription-yearly-price"/);
  assert.match(accountHtml, /id="account-created"/);
  assert.match(accountHtml, /data-plan-option="pro"/);
  assert.match(calculatorScript, /planningBreakField\.hidden = !enabled/);
  assert.match(calculatorScript, /workFunction: selectedWorkFunction\(\)/);
  assert.match(calculatorScript, /applyWorkFunction\(snapshotFunction, \{ preserveRate: true, preserveSettings: true \}\)/);
  assert.match(calculatorScript, /pdfProBadge\.hidden = context\.isPro/);
  assert.match(calculatorScript, /Bewaar voor later/);
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

test("het accountmenu heeft op iedere apppagina een vaste link naar Vandaag", async () => {
  const pages = ["index.html", "account.html", "dashboard.html", "workdays.html", "projects.html"];
  for (const page of pages) {
    const html = await readFile(new URL(`../../app/${page}`, import.meta.url), "utf8");
    assert.match(html, /id="today-page-link" href="index\.html"[^>]*>Vandaag<\/a>/);
  }
});

test("Authmails verwijzen ook vanuit localhost altijd terug naar Overuurtje.nl", async () => {
  const configContext = await runService("app/saas/config.js", {
    URL,
    location: {
      href: "http://localhost:4173/app/index.html",
      hostname: "localhost",
      protocol: "http:"
    },
    OVERUURTJE_RUNTIME_CONFIG: {
      publicSiteUrl: "https://overuurtje.nl",
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "publishable"
    }
  });

  assert.equal(configContext.OveruurtjeConfig.accountUrl, "http://localhost:4173/app/account.html");
  assert.equal(configContext.OveruurtjeConfig.authAccountUrl, "https://overuurtje.nl/account.html");
  assert.equal(configContext.OveruurtjeConfig.authWorkdaysUrl, "https://overuurtje.nl/workdays.html");

  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => {},
      signUp: async (payload) => {
        calls.push({ method: "signUp", payload });
        return { data: {}, error: null };
      },
      resetPasswordForEmail: async (email, options) => {
        calls.push({ method: "reset", email, options });
        return { data: {}, error: null };
      },
      signInWithOAuth: async (payload) => {
        calls.push({ method: "oauth", payload });
        return { data: {}, error: null };
      }
    }
  };
  class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }
  const authContext = await runService("app/saas/authService.js", {
    CustomEvent,
    document: { dispatchEvent: () => {} },
    location: { href: "http://localhost:4173/app/workdays.html?invite=invite-token" },
    URL,
    OveruurtjeConfig: configContext.OveruurtjeConfig,
    OveruurtjeSupabase: { getClient: async () => client }
  });

  await authContext.OveruurtjeAuth.ready;
  await authContext.OveruurtjeAuth.signUp("test@example.com", "secret");
  await authContext.OveruurtjeAuth.requestPasswordReset("test@example.com");
  await authContext.OveruurtjeAuth.signInWithProvider("google");
  await authContext.OveruurtjeAuth.signInWithProvider("facebook");

  assert.equal(
    calls[0].payload.options.emailRedirectTo,
    "https://overuurtje.nl/workdays.html?invite=invite-token"
  );
  assert.equal(
    calls[1].options.redirectTo,
    "https://overuurtje.nl/account.html?mode=reset"
  );
  assert.equal(JSON.stringify(calls.slice(0, 2)).includes("localhost"), false);
  assert.equal(calls[2].payload.provider, "google");
  assert.equal(
    calls[2].payload.options.redirectTo,
    "http://localhost:4173/app/workdays.html?invite=invite-token"
  );
  assert.equal(calls[3].payload.provider, "facebook");

  assert.equal(authContext.OveruurtjeAuth.validatePassword("kort1").valid, false);
  assert.equal(authContext.OveruurtjeAuth.validatePassword("alleenletters").valid, false);
  assert.equal(authContext.OveruurtjeAuth.validatePassword("12345678").valid, false);
  assert.equal(authContext.OveruurtjeAuth.validatePassword("overuur8").valid, false);
  assert.equal(authContext.OveruurtjeAuth.validatePassword("Overuur8").valid, true);
});

test("inlogvenster toont Google en Facebook met merklogo's", async () => {
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");

  assert.match(sessionUi, /data-auth-provider="google"/);
  assert.match(sessionUi, /data-auth-provider="facebook"/);
  assert.doesNotMatch(sessionUi, /data-auth-provider="apple"/);
  assert.match(sessionUi, /class="auth-provider-logo"/);
});

test("authfouten tonen nooit een leeg object aan de gebruiker", async () => {
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");
  const authService = await readFile(path.join(rootDirectory, "app/saas/authService.js"), "utf8");

  assert.match(sessionUi, /function authErrorText/);
  assert.ok(sessionUi.includes('!["{}", "[object Object]"].includes'));
  assert.match(sessionUi, /De bevestigingsmail kon niet worden verstuurd/);
  assert.ok(sessionUi.includes("authStatus.textContent = authErrorText(error, authMode)"));
  assert.match(authService, /event === "PASSWORD_RECOVERY"/);
  assert.match(sessionUi, /id = "password-recovery-dialog"/);
  assert.match(sessionUi, /await auth\.updatePassword\(password\.value\)/);
  assert.match(sessionUi, /await auth\.signOut\(\)/);
  assert.match(sessionUi, /password-reset/);
});

test("gastnavigatie houdt uitleg links en accountacties rechts", async () => {
  const indexHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const styles = await readFile(path.join(rootDirectory, "app/styles.css"), "utf8");
  const aboutPosition = indexHtml.indexOf('class="guest-about-link guest-about-link--header"');
  const navigationPosition = indexHtml.indexOf('class="account-navigation"');

  assert.ok(aboutPosition >= 0);
  assert.ok(navigationPosition > aboutPosition);
  assert.match(styles, /\.guest-about-link--header\s*\{[^}]*left:\s*30px;/);
  assert.match(styles, /\.account-navigation\s*\{[^}]*right:\s*30px;/);
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
  assert.doesNotMatch(html, /Volgende werkdag toevoegen/);
  assert.doesNotMatch(html, /id="copy-project-times"/);
  assert.match(html, /id="paste-project-times"/);
  assert.match(html, /id="cancel-project-times"/);
  assert.match(html, /id="copy-day-invoice"/);
  assert.match(html, /class="day-copy-panel"/);
  assert.match(script, /selectedWorkdays = new Set/);
  assert.match(script, /`\$\{carouselIndex \+ 1\} van \$\{cards\.length\}`/);
  assert.match(script, /matchMedia\("\(max-width: 760px\)"\)\.matches \? 1 : 3/);
  assert.match(script, /startTime: sourceData\.startTime/);
  assert.match(script, /endTime: sourceData\.endTime/);
  assert.match(script, /function pasteProjectTimes/);
  assert.match(script, /data-copy-project-times/);
  assert.match(script, /function startCopyTimes\(dayId\)/);
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
  assert.match(calculatorScript, /projectService\.saveDay/);
  assert.match(calculatorScript, /sourceType = projectDayId \? "project_day" : "workday"/);
  assert.match(calculatorHtml, /id="project-day-context"/);
  assert.match(calculatorHtml, /id="share-from-participants"/);
  assert.doesNotMatch(calculatorHtml, /id="private-participant-panel"/);
  assert.doesNotMatch(calculatorHtml, /Deelnemers zonder Overuurtje/);
  assert.doesNotMatch(calculatorScript, /sessionStorage\.getItem\(promptKey\)/);
  assert.match(workdaysHtml, /<h1>Werkdagen<\/h1>/);
  assert.doesNotMatch(accountHtml, /id="account-workday-list"/);
  assert.doesNotMatch(accountHtml, /id="account-project-list"/);
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

test("Free-account bewaart alleen een actuele of doorlopende nachtwerkdag", async () => {
  const storage = new Map();
  const context = await runService("app/saas/freeActiveWorkdayService.js", {
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    }
  });
  const service = context.OveruurtjeFreeActiveWorkday;
  const now = new Date(2026, 6, 31, 10, 0, 0);

  assert.equal(service.canSaveSnapshot({ date: "2026-07-31", startTime: "08:00", endTime: "" }, now), true);
  assert.equal(service.canSaveSnapshot({ date: "2026-07-30", startTime: "18:00", endTime: "" }, now), true);
  assert.equal(service.canSaveSnapshot({ date: "2026-07-30", startTime: "18:00", endTime: "02:00" }, now), true);
  assert.equal(service.canSaveSnapshot({ date: "2026-07-30", startTime: "08:00", endTime: "18:00" }, now), false);
  assert.equal(service.canSaveSnapshot({ date: "2026-07-29", startTime: "18:00", endTime: "02:00" }, now), false);
});

test("Free-account kan zijn actieve werkdag na heropenen hervatten en zelf wissen", async () => {
  const storage = new Map();
  const context = await runService("app/saas/freeActiveWorkdayService.js", {
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    }
  });
  const service = context.OveruurtjeFreeActiveWorkday;
  const calculationData = {
    date: "2026-07-31",
    startTime: "08:00",
    endTime: "",
    workdayName: "Draaidag"
  };

  const saved = service.save("free-user", { sourceId: "shared-source", calculationData });
  const loaded = service.load("free-user", new Date(2026, 6, 31, 12, 0, 0));
  assert.equal(saved.sourceId, "shared-source");
  assert.equal(loaded.sourceId, "shared-source");
  assert.equal(loaded.calculationData.workdayName, "Draaidag");

  service.clear("free-user");
  assert.equal(service.load("free-user", new Date(2026, 6, 31, 12, 0, 0)), null);
});

test("Werkdagen bewaren een optionele naam zonder die in financiële data te dupliceren", async () => {
  const storage = new Map();
  const context = await runService("app/saas/workdayService.js", {
    crypto: { randomUUID: () => "named-workday" },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    OveruurtjeSupabase: { getClient: async () => null }
  });
  const saved = await context.OveruurtjeWorkdays.save("user-1", {
    name: "KLM Commercial",
    workDate: "2026-07-27",
    calculationData: { startTime: "08:00", endTime: "18:00" }
  }, { mock: true });

  assert.equal(saved.name, "KLM Commercial");
  assert.equal(saved.calculationData.name, undefined);
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

test("Projectservice werkt één projectdag bij zonder andere projectdagen te overschrijven", async () => {
  const storage = new Map();
  const context = await runService("app/saas/projectService.js", {
    crypto: { randomUUID: (() => { let id = 0; return () => `project-day-${++id}`; })() },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    OveruurtjeSupabase: { getClient: async () => null }
  });
  const service = context.OveruurtjeProjects;
  const project = await service.saveProject("user-1", {
    name: "Project met losse opslag",
    startDate: "2026-07-28",
    endDate: "2026-07-29"
  }, { mock: true });
  const initial = await service.replaceDays("user-1", project.id, [{
    workDate: "2026-07-28",
    calculationData: { startTime: "08:00", endTime: "18:00" }
  }, {
    workDate: "2026-07-29",
    calculationData: { startTime: "09:00", endTime: "17:00" }
  }], { mock: true });
  const first = initial.days[0];

  await service.saveDay("user-1", project.id, {
    id: first.id,
    workDate: first.workDate,
    calculationData: { startTime: "07:30", endTime: "18:30" }
  }, { mock: true });

  const updated = await service.get("user-1", project.id, { mock: true });
  assert.equal(updated.days.length, 2);
  assert.equal(updated.days[0].calculationData.startTime, "07:30");
  assert.equal(updated.days[1].calculationData.startTime, "09:00");
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
  assert.doesNotMatch(workdaysHtml, /id="take-over-shared-times"/);
  assert.doesNotMatch(workdaysHtml, /id="shared-existing-workday-dialog"/);
  assert.match(projectsHtml, /id="share-project-day"/);
  assert.match(indexHtml, /id="share-from-participants"/);
  assert.doesNotMatch(indexHtml, /id="share-current-workday"/);
  assert.ok(indexHtml.indexOf("saas/shareService.js") < indexHtml.indexOf("saas/sessionUi.js"));
});

test("ontvangers kunnen een gedeelde werkdag uit hun eigen overzicht verwijderen", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607310003_recipient_remove_workday_share.sql"),
    "utf8"
  );
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");

  assert.match(migration, /s\.recipient_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /s\.owner_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /grant execute on function public\.remove_workday_share\(uuid\) to authenticated/i);
  assert.match(workdaysScript, /shared-workday-delete-button/);
  assert.match(workdaysScript, /await shareService\.remove\(pendingDeleteShareId\)/);
});

test("Volledige projecten delen blijft beperkt tot projectmetadata en dagtijden", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607290002_project_sharing.sql"),
    "utf8"
  );
  const projectsHtml = await readFile(path.join(rootDirectory, "app/projects.html"), "utf8");
  const projectsScript = await readFile(path.join(rootDirectory, "app/projects.js"), "utf8");
  const shareService = await readFile(path.join(rootDirectory, "app/saas/shareService.js"), "utf8");

  assert.match(migration, /create table if not exists public\.project_share_invites/i);
  assert.match(migration, /create table if not exists public\.project_shares/i);
  assert.match(migration, /alter table public\.project_shares enable row level security/i);
  assert.match(migration, /Recipients read project shares/i);
  assert.match(migration, /create or replace function public\.create_project_share_invite/i);
  assert.match(migration, /create or replace function public\.preview_project_share_invite/i);
  assert.match(migration, /create or replace function public\.claim_project_share_invite/i);
  assert.match(migration, /create or replace function public\.get_received_project_shares/i);
  assert.match(migration, /'workDate', pd\.work_date/i);
  assert.match(migration, /'startTime', coalesce\(pd\.calculation_data ->> 'startTime'/i);
  assert.match(migration, /'endTime', coalesce\(pd\.calculation_data ->> 'endTime'/i);
  assert.doesNotMatch(migration, /'rateAmount'/i);
  assert.doesNotMatch(migration, /'subtotal'/i);
  assert.match(projectsHtml, /id="share-project"/);
  assert.match(projectsHtml, /id="shared-projects-section"/);
  assert.match(projectsHtml, /id="project-invite-dialog"/);
  assert.match(projectsScript, /shares\.listReceivedProjects\(\)/);
  assert.match(projectsScript, /shares\.claimInvite\(token,\s*"project"\)/);
  assert.match(shareService, /create_project_share_invite/);
  assert.match(shareService, /get_received_project_shares/);
});

test("Delen kan voor Free een privacyveilige bron klaarzetten en bij berekenen bijwerken", async () => {
  const appScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const inviteMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607250003_workday_share_invites.sql"),
    "utf8"
  );
  const freeSharingMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607310002_free_workday_sharing.sql"),
    "utf8"
  );

  assert.match(appScript, /sessionUi\?\.openAuth\("register", \{ purpose: "workday-sharing" \}\)/);
  assert.match(appScript, /shareService\.prepareWorkdaySource/);
  assert.match(appScript, /async function syncFreeSharedWorkdaySource\(\)/);
  assert.match(appScript, /void syncFreeSharedWorkdaySource\(\)/);
  assert.match(appScript, /sourceType = projectDayId \? "project_day" : "workday"/);
  assert.match(inviteMigration, /after update of calculation_data on public\.workdays/i);
  assert.match(freeSharingMigration, /add column if not exists sharing_only boolean/i);
  assert.match(freeSharingMigration, /create or replace function public\.prepare_shared_workday_source/i);
  assert.match(freeSharingMigration, /'workdayName'/i);
  assert.match(freeSharingMigration, /'clientName'/i);
  assert.match(freeSharingMigration, /'startTime'/i);
  assert.match(freeSharingMigration, /'endTime'/i);
  assert.match(freeSharingMigration, /p_source_type = 'project_day' and not public\.current_user_is_pro\(\)/i);
  assert.doesNotMatch(freeSharingMigration, /p_source_type = 'workday' and not public\.current_user_is_pro\(\)/i);
  assert.doesNotMatch(appScript, /overuurtje:shares-changed[\s\S]{0,200}persistWorkday/);
});

test("Werkdag delen wordt nergens als Pro-functie gepresenteerd", async () => {
  const files = await Promise.all([
    "app/index.html",
    "app/account.html",
    "app/workdays.html",
    "app/wat-is-overuurtje.html",
    "app/saas/shareUi.js"
  ].map((file) => readFile(path.join(rootDirectory, file), "utf8")));
  const combined = files.join("\n");

  assert.doesNotMatch(combined, /Overuurtje Pro[\s\S]{0,180}(werkdag|werktijden) delen/i);
  assert.doesNotMatch(combined, /(werkdag|werktijden) delen[\s\S]{0,180}Overuurtje Pro/i);
  assert.doesNotMatch(combined, /Pro[^<\n]{0,80}deel werktijden/i);
});

test("Werkdagnamen en deelnemers worden privacyvriendelijk gedeeld", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607270001_workday_names_and_participants.sql"),
    "utf8"
  );
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");
  const workdaysHtml = await readFile(path.join(rootDirectory, "app/workdays.html"), "utf8");

  assert.match(migration, /add column if not exists name text/i);
  assert.match(migration, /create or replace function public\.get_workday_share_participants/i);
  assert.match(migration, /split_part\(trim\(p\.display_name\), ' ', 1\)/i);
  assert.doesNotMatch(migration, /calculation_data\s*->>\s*'[^']*(rate|amount|parking|kilometer)/i);
  assert.match(calculatorHtml, /name="workdayName"/);
  assert.match(calculatorHtml, /Deel je werkdag met collega's en zie wie er meedoen/);
  assert.match(accountHtml, /name="displayName"/);
  assert.match(calculatorHtml, /id="current-workday-participant-list"/);
  assert.doesNotMatch(workdaysHtml, /data-share-participants-list/);
  const appScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const styles = await readFile(path.join(rootDirectory, "app/styles.css"), "utf8");
  assert.match(appScript, /chip\.className = "participant-chip is-account"/);
  assert.match(styles, /\.participant-chip\.is-account\s*\{\s*order:\s*0/);
  assert.doesNotMatch(styles, /\.participant-chip\.is-private/);
});

test("direct gedeelde werkdagen blijven live en melden een opgeslagen eindtijd", async () => {
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607280003_shared_workday_live_updates.sql"),
    "utf8"
  );

  assert.match(calculatorScript, /endTime: currentSharedSource\s*\?\s*endTimeField\.value/);
  assert.match(calculatorScript, /refreshSharedReceiverTimes/);
  assert.match(calculatorScript, /setInterval\([\s\S]*refreshSharedReceiverTimes[\s\S]*15000/);
  assert.match(calculatorScript, /currentSharedSource && !currentSharedSourceEndTime && !sharedReceiverCalculatedEarly/);
  assert.match(calculatorScript, /sharedReceiverCalculatedEarly = true/);
  assert.match(calculatorScript, /async function resumeSharedWorkday\(\)/);
  assert.match(calculatorScript, /sharedTimeOverrides\.delete\("endTime"\)/);
  assert.match(calculatorHtml, /id="unfinished-shared-workday-dialog"/);
  assert.match(calculatorHtml, /Verder met gedeelde werkdag/);
  assert.match(migration, /when old_end = '' and new_end <> '' then 'workday_completed'/);
  assert.doesNotMatch(migration, /accepted_at is null/);
  assert.match(sessionUi, /workday_completed/);
  assert.match(sessionUi, /heeft de eindtijd vastgelegd/);
});

test("gedeelde ontvangers zien alleen accountdeelnemers met hun Crew Card-badge", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608090001_crew_cards_and_badges.sql"),
    "utf8"
  );
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const timePickerScript = await readFile(path.join(rootDirectory, "app/timePicker.js"), "utf8");
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");
  const shareServiceScript = await readFile(path.join(rootDirectory, "app/saas/shareService.js"), "utf8");

  assert.match(migration, /get_workday_share_participants\(p_source_type text, p_source_id uuid\)/i);
  assert.match(migration, /selected_badge_icon/i);
  assert.match(migration, /joint_workdays/i);
  assert.doesNotMatch(calculatorHtml, /private-participant-panel|Deelnemers zonder Overuurtje/i);
  assert.match(calculatorHtml, /id="shared-receiver-context"/);
  assert.match(calculatorHtml, /id="leave-shared-view"/);
  assert.match(calculatorScript, /const source = currentSharedSource\s*\?\s*currentSharedSource/);
  assert.match(calculatorScript, /participant\.hasAccount !== false/);
  assert.match(calculatorScript, /form\.classList\.toggle\("is-shared-receiver", active\)/);
  assert.match(calculatorScript, /sharedTimeOverrides = new Set\(\)/);
  assert.match(calculatorScript, /dateField\.disabled = active/);
  assert.match(calculatorScript, /const locked = active && !sharedTimeOverrides\.has\(field\.name\)/);
  assert.match(calculatorHtml, /id="lock-shared-start-time"/);
  assert.match(calculatorHtml, /id="lock-shared-end-time"/);
  assert.doesNotMatch(calculatorHtml, /id="unlock-shared-times"/);
  assert.match(calculatorScript, /projectCreateLink\.hidden = active/);
  assert.match(calculatorScript, /shareFromParticipantsButton\.hidden = active/);
  assert.doesNotMatch(calculatorScript, /privateParticipantPanel|privateParticipants/);
  assert.match(calculatorScript, /resumeLiveWorkdayButton && active/);
  assert.match(timePickerScript, /field\.dataset\.sharedLocked === "true"/);
  assert.match(workdaysScript, /index\.html\?shared=/);
  assert.doesNotMatch(workdaysScript, /sharedOwnerName: item\.ownerName \|\| ""/);
  assert.match(shareServiceScript, /selectedBadgeIcon: row\.selected_badge_icon \|\| ""/);
});

test("ongelezen notificaties krijgen een eenmalige duidelijke openingsmelding", async () => {
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");
  assert.match(sessionUi, /Je hebt een nieuw bericht/);
  assert.match(sessionUi, /Bekijk bericht/);
  assert.match(sessionUi, /overuurtjeNotificationPrompt:/);
  assert.match(sessionUi, /sessionStorage\.setItem\(promptKey, "shown"\)/);
});

test("een geaccepteerde uitnodiging veroorzaakt niet direct nogmaals een berichtmelding", async () => {
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");
  const shareService = await readFile(path.join(rootDirectory, "app/saas/shareService.js"), "utf8");

  assert.match(workdaysScript, /claimInvite\(token\)[\s\S]{0,700}markShareNotificationsRead\(shareId\)/);
  assert.match(shareService, /async function markShareNotificationsRead\(shareId\)/);
  assert.match(shareService, /item\.shareId === shareId && !item\.readAt/);
  assert.match(shareService, /markNotificationsRead\(notificationIds\)/);
});

test("gedeelde bron en metadata blijven behouden en live gesynchroniseerd", async () => {
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");

  assert.match(calculatorScript, /sharedSourceType: currentSharedSource\?\.type \|\| ""/);
  assert.match(calculatorScript, /sharedSourceId: currentSharedSource\?\.id \|\| ""/);
  assert.match(calculatorScript, /sharedOwnerName: currentSharedOwnerName \|\| ""/);
  assert.match(calculatorScript, /workdayName\.value !== \(shared\.workdayName \|\| ""\)/);
  assert.match(calculatorScript, /clientName\.value !== \(shared\.clientName \|\| ""\)/);
  assert.match(calculatorScript, /currentSharedOwnerName !== \(shared\.ownerName \|\| ""\)/);
  assert.match(calculatorScript, /if \(!changed\) return;\s*updateSharedReceiverMode\(\)/);
});

test("een gedeelde werkdag herstelt na herladen vanuit de blijvende deel-URL", async () => {
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");

  assert.match(workdaysScript, /index\.html\?shared=\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(calculatorScript, /async function restoreSharedTimesFromUrl\(\)/);
  assert.match(calculatorScript, /new URLSearchParams\(location\.search\)\.get\("shared"\)/);
  assert.match(calculatorScript, /const shared = received\.find\(\(item\) => item\.id === shareId\)/);
  assert.match(calculatorScript, /sharedSourceType: shared\.sourceType \|\| ""/);
  assert.match(calculatorScript, /sharedSourceId: shared\.sourceId \|\| ""/);
  assert.match(calculatorScript, /if \(!\(await restoreSharedTimesFromUrl\(\)\)\) applySharedTimesImport\(\)/);
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

test("Deelservice maakt een beperkte Free-deelbron via de beveiligde RPC", async () => {
  const calls = [];
  const context = await runService("app/saas/shareService.js", {
    OveruurtjeSupabase: {
      getClient: async () => ({
        rpc: async (name, values) => {
          calls.push({ name, values });
          return { data: "share-source-1", error: null };
        }
      })
    }
  });

  const sourceId = await context.OveruurtjeShares.prepareWorkdaySource({
    id: null,
    name: "Draaidag",
    workDate: "2026-07-31",
    calculationData: {
      workdayName: "Draaidag",
      clientName: "Opdrachtgever",
      startTime: "08:00",
      endTime: "",
      dayRate: 900
    }
  });

  assert.equal(sourceId, "share-source-1");
  assert.equal(calls[0].name, "prepare_shared_workday_source");
  assert.equal(calls[0].values.p_work_date, "2026-07-31");
});

test("Free en Pro-ontvangers openen één canonieke gedeelde werkdag", async () => {
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");
  const appScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const shareService = await readFile(path.join(rootDirectory, "app/saas/shareService.js"), "utf8");
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608020002_canonical_shared_workdays.sql"),
    "utf8"
  );

  assert.doesNotMatch(workdaysScript, /openSharedTimesInCalculator|takeoverSnapshot|activeInvite/);
  assert.match(workdaysScript, /location\.href = `index\.html\?shared=\$\{encodeURIComponent\(item\.id\)\}`/);
  assert.match(appScript, /let currentSharedSource = null/);
  assert.match(appScript, /let currentReceivedShareId = null/);
  assert.match(appScript, /shareService\.saveRecipientCalculation\(currentReceivedShareId, snapshot\)/);
  assert.match(shareService, /save_received_workday_calculation/);
  assert.match(migration, /create table if not exists public\.workday_share_recipient_data/i);
  assert.match(migration, /recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /recipient_calculation_data jsonb/i);
  assert.doesNotMatch(appScript, /currentSharedSource[\s\S]{0,160}persistWorkday\(snapshot/);
  assert.match(appScript, /shareService\.listParticipants\(source\.type, source\.id\)/);
  assert.match(
    appScript,
    /!currentWorkdayId\s*&&\s*!currentShareWorkdayId\s*&&\s*!currentProjectDayContext\s*&&\s*!currentSharedSource/
  );
  assert.doesNotMatch(
    appScript,
    /async function refreshCurrentWorkdayParticipants\(\)[\s\S]{0,250}!currentUserContext\?\.isPro/
  );
  assert.match(appScript, /const canShare = !hasAccount \|\| \(hasDate && hasStartTime\)/);
  assert.match(appScript, /Maak een gratis account om een werkdag te delen/);
  assert.doesNotMatch(
    appScript,
    /const canShare = (?:Boolean\()?currentUserContext\?\.isPro/
  );
});

test("Free-account toont Pro-functies zonder misleidende beschikbaarheidslabels", async () => {
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");
  assert.doesNotMatch(accountHtml, /available-status/);
  assert.doesNotMatch(accountHtml, />Beschikbaar<\/span>/);
});

test("alleen gasten zien een niet-klikbare extra functie als Pro-voorbeeld", async () => {
  const [calculatorHtml, calculatorScript, styles] = await Promise.all([
    readFile(path.join(rootDirectory, "app/index.html"), "utf8"),
    readFile(path.join(rootDirectory, "app/app.js"), "utf8"),
    readFile(path.join(rootDirectory, "app/styles.css"), "utf8")
  ]);

  assert.match(calculatorHtml, /class="department-choice department-choice-pro" aria-disabled="true"/);
  assert.match(calculatorHtml, /name="department-pro-preview"[^>]+disabled/);
  assert.match(calculatorHtml, /<b>Extra functie<\/b><small>Pro<\/small>/);
  assert.match(calculatorHtml, /name="workdayName"[^>]+placeholder="Werkdag"/);
  assert.match(calculatorScript, /choice\.classList\.contains\("department-choice-pro"\)/);
  assert.match(calculatorScript, /choice\.hidden\s*=\s*true;[\s\S]*?input\.disabled\s*=\s*true;/);
  assert.match(styles, /\.department-choice-pro\s*\{[\s\S]*?cursor:\s*not-allowed/);
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
    assert.equal(template.includes("localhost"), false, `${templateName} bevat een lokale link`);
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

test("Accountmenu en desktop-accountlayouts blijven consequent uitgelijnd", async () => {
  for (const page of ["index.html", "dashboard.html", "account.html", "workdays.html", "projects.html"]) {
    const html = await readFile(path.join(rootDirectory, "app", page), "utf8");
    const menuStart = html.indexOf('class="account-dropdown"');
    const menuEnd = html.indexOf("</div>", menuStart);
    const menu = html.slice(menuStart, menuEnd);
    const labels = ["Vandaag", "Crew Card", "Werkdagen", "Projecten", "Account", "Uitloggen"];
    const positions = labels.map((label) => menu.indexOf(`>${label}<`));
    assert.ok(positions.every((position) => position >= 0), `${page} mist een menu-item`);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${page} heeft een afwijkende menuvolgorde`);
  }

  const account = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");
  const styles = await readFile(path.join(rootDirectory, "app/styles.css"), "utf8");
  assert.match(account, /class="account-credentials-grid"/);
  assert.match(account, /id="compact-function-setting"[\s\S]*name="defaultRateMode"[\s\S]*name="defaultDayRate"/);
  assert.match(styles, /\.account-credentials-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(styles, /\.workdays-content\s*\{[^}]*width:\s*min\(820px,\s*calc\(100% - 64px\)\)/);
  assert.match(
    styles,
    /\.received-workdays\s*\{[^}]*width:\s*min\(820px,\s*calc\(100% - 64px\)\);[^}]*margin:\s*8px auto 0;/
  );
  assert.match(
    styles,
    /@media \(max-width:\s*760px\)[\s\S]*\.workdays-content\s*\{[^}]*width:\s*calc\(100% - 40px\);[\s\S]*\.received-workdays\s*\{[^}]*width:\s*calc\(100% - 40px\);/
  );
  assert.match(
    styles,
    /\.timeline-workday-actions\s*\{[^}]*grid-template-columns:\s*minmax\(96px,\s*128px\)\s*42px;[^}]*justify-content:\s*end;/
  );
  assert.match(
    styles,
    /\.timeline-workday-actions \.workday-share-button\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/
  );
  assert.match(
    styles,
    /\.timeline-workday-actions \.workday-delete-button\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/
  );
  assert.match(
    styles,
    /\.input-panel\.is-shared-receiver \.time-control\.is-shared-locked\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/
  );
  assert.match(
    styles,
    /\.input-panel\.is-shared-receiver \.time-control\.is-shared-locked input\[data-time-picker\]\s*\{[^}]*border-radius:\s*12px;[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.34\);/
  );
});

test("vooraf opgeslagen werkdagen melden hun start zonder live invoer te notificeren", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607290001_workday_start_notifications.sql"),
    "utf8"
  );
  const reminders = await readFile(path.join(rootDirectory, "app/workdayNotifications.js"), "utf8");

  assert.match(migration, /dispatch_workday_start_notifications/i);
  assert.match(migration, /w\.updated_at as configured_at/i);
  assert.match(migration, /configured_at <= starts_at - interval '1 minute'/i);
  assert.match(migration, /'workday_start_owner'::text/i);
  assert.match(migration, /'workday_started'::text/i);
  assert.match(migration, /share\.accepted_at is not null/i);
  assert.match(migration, /share\.delivered_at is not null/i);
  assert.match(migration, /cron\.schedule\([\s\S]*'\* \* \* \* \*'/i);
  assert.doesNotMatch(reminders, /type:\s*"workday_start"/i);
});

test("gastheader, QR-knop en gedeelde werkdagen blijven compact en uniek", async () => {
  const styles = await readFile(path.join(rootDirectory, "app/styles.css"), "utf8");
  const workdays = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");

  for (const page of ["index.html", "dashboard.html", "account.html", "workdays.html", "projects.html"]) {
    const html = await readFile(path.join(rootDirectory, "app", page), "utf8");
    assert.match(html, /data-subscription-upgrade="signup">Pro<\/button>/);
  }

  assert.match(styles, /\.qr-scanner-open\s*\{[^}]*min-width:\s*42px;[^}]*max-width:\s*42px;[^}]*aspect-ratio:\s*1;/s);
  assert.match(styles, /\.qr-scanner-open\s*\{[^}]*border-radius:\s*999px;/s);
  assert.match(workdays, /item\.calculationData\?\.importedFromShare/);
  assert.match(workdays, /\.\.\.receivedShares\.map/);
});

test("Free en Pro-eigenaren krijgen bericht wanneer een collega aansluit", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607310004_workday_share_joined_notifications.sql"),
    "utf8"
  );
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");
  const participantsMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202607280002_shared_private_participants.sql"),
    "utf8"
  );

  assert.match(migration, /after insert on public\.workday_shares/i);
  assert.match(migration, /'workday_share_joined'/i);
  assert.doesNotMatch(migration, /is_pro|current_user_is_pro/i);
  assert.match(sessionUi, /item\.type === "workday_share_joined"/);
  assert.match(participantsMigration, /grant execute on function public\.get_workday_share_participants\(text, uuid\) to authenticated/i);
});

test("actieve gedeelde werkdagen blijven herkenbaar na navigatie en openen direct vanuit meldingen", async () => {
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");
  const pushFunction = await readFile(
    path.join(rootDirectory, "supabase/functions/send-push-notifications/index.ts"),
    "utf8"
  );
  const resumeMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608030001_shared_workday_reopened.sql"),
    "utf8"
  );

  assert.match(calculatorHtml, /id="active-shared-reminder"/);
  assert.match(calculatorHtml, /id="shared-completion-dialog"/);
  assert.match(calculatorHtml, /id="shared-resume-dialog"/);
  assert.match(calculatorScript, /async function findActiveReceivedShare\(\)/);
  assert.match(calculatorScript, /kind:\s*"shared",\s*share:\s*activeShare/);
  assert.match(calculatorScript, /!persistedWorkdayEndTime[\s\S]{0,180}hasAcceptedSharedRecipients\(\)/);
  assert.match(sessionUi, /config\.calculatorUrl\}\?shared=/);
  assert.match(pushFunction, /if \(delivery\.share_id\)[\s\S]{0,120}\/index\.html\?shared=/);
  assert.match(resumeMigration, /'workday_resumed'/i);
});

test("Werkdagen toont gedeelde dagen rustig en houdt installatie boven de juridische footer", async () => {
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const styles = await readFile(path.join(rootDirectory, "app/styles.css"), "utf8");
  const sharedCard = workdaysScript.slice(
    workdaysScript.indexOf("function createSharedTimelineItem"),
    workdaysScript.indexOf("document.addEventListener", workdaysScript.indexOf("function createSharedTimelineItem"))
  );

  assert.match(sharedCard, /Gedeeld door/);
  assert.match(sharedCard, /workday-origin-tag">Gedeeld/);
  assert.match(sharedCard, /workday-more-button/);
  assert.doesNotMatch(sharedCard, /startTime|endTime|workday-status/);
  assert.ok(calculatorHtml.indexOf('class="footer-install-row"') < calculatorHtml.indexOf('class="footer-meta-row"'));
  assert.match(styles, /\.footer-utility-actions\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?\.footer-meta-row\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
});

test("Crew Card gebruikt server-side badges en toont alleen accountdeelnemers", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608090001_crew_cards_and_badges.sql"),
    "utf8"
  );
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");
  const dashboardHtml = await readFile(path.join(rootDirectory, "app/dashboard.html"), "utf8");
  const dashboardScript = await readFile(path.join(rootDirectory, "app/dashboard.js"), "utf8");
  const badgeService = await readFile(path.join(rootDirectory, "app/saas/badgeService.js"), "utf8");
  const shareService = await readFile(path.join(rootDirectory, "app/saas/shareService.js"), "utf8");
  const crewCardMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608090002_crew_card_profiles.sql"),
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.badges/i);
  assert.match(migration, /create table if not exists public\.user_badges/i);
  assert.match(migration, /create or replace function public\.evaluate_my_badges\(\)/i);
  assert.match(migration, /create or replace function public\.get_my_crew_card\(\)/i);
  assert.match(migration, /insert into public\.badges[\s\S]*'geen_negen_tot_vijf'/i);
  assert.equal((migration.match(/^  \('/gm) || []).length, 30);
  assert.match(migration, /on conflict do nothing returning badge_id/i);
  assert.match(migration, /grant execute on function public\.evaluate_my_badges\(\) to authenticated/i);
  assert.match(migration, /project_pdf_generated/i);
  assert.doesNotMatch(migration, /extract\(month from work_date\) = 1 and extract\(day from work_date\) = 1/);

  assert.match(calculatorHtml, /id="current-workday-participants"/);
  assert.doesNotMatch(calculatorHtml, /private-participant-panel|Deelnemers zonder Overuurtje|\(optioneel\)/i);
  assert.doesNotMatch(calculatorScript, /privateParticipants|addPrivateParticipant/);
  assert.match(calculatorScript, /participant\.selectedBadgeIcon/);
  assert.match(dashboardHtml, /id="crew-card"/);
  assert.match(dashboardHtml, /id="crew-card-recent-badges"/);
  assert.match(dashboardHtml, /id="crew-badge-dialog"/);
  assert.match(dashboardScript, /maximaal drie badges uitlichten/i);
  assert.match(dashboardScript, /data-badge-action="title"/);
  assert.match(crewCardMigration, /create table if not exists public\.user_featured_badges/i);
  assert.match(crewCardMigration, /Kies maximaal drie badges/i);
  assert.match(crewCardMigration, /'featuredBadges', featured\.items/i);
  assert.match(badgeService, /record_badge_activity/);
  assert.match(shareService, /selectedBadgeIcon/);
});

test("nieuwe badges worden gemeld en blijven selecteerbaar op de Crew Card", async () => {
  const events = [];
  const calls = [];
  const earnedBadge = {
    key: "eerste_draaidag",
    name: "Eerste Draaidag",
    description: "Je eerste werkdag is geregistreerd.",
    icon: "🎬",
    earned_at: "2026-08-09T12:00:00Z"
  };
  const context = await runService("app/saas/badgeService.js", {
    document: { dispatchEvent: (event) => events.push(event) },
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
    OveruurtjeSupabase: {
      getClient: async () => ({
        rpc: async (name, values) => {
          calls.push({ name, values });
          if (name === "record_badge_activity") return { data: [earnedBadge], error: null };
          if (name === "list_my_badges") {
            return { data: [{ ...earnedBadge, hidden: false, is_featured: false, featured_position: null, is_title: false }], error: null };
          }
          if (name === "set_my_crew_badges") return { data: null, error: null };
          return { data: [], error: null };
        }
      })
    }
  });

  const awards = await context.OveruurtjeBadges.track("workday_saved", "00000000-0000-0000-0000-000000000001");
  assert.equal(awards.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "overuurtje:badges-earned");
  assert.equal(events[0].detail.awards[0].key, "eerste_draaidag");

  const collection = await context.OveruurtjeBadges.list();
  assert.equal(collection[0].earnedAt, earnedBadge.earned_at);
  await context.OveruurtjeBadges.saveSelection([collection[0].key], collection[0].key);
  const selectionCall = calls.find((call) => call.name === "set_my_crew_badges");
  assert.equal(selectionCall.values.p_badge_keys[0], "eerste_draaidag");
  assert.equal(selectionCall.values.p_title_badge_key, "eerste_draaidag");

  const notificationMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608090005_badge_notifications.sql"),
    "utf8"
  );
  const sessionUi = await readFile(path.join(rootDirectory, "app/saas/sessionUi.js"), "utf8");
  const pushFunction = await readFile(
    path.join(rootDirectory, "supabase/functions/send-push-notifications/index.ts"),
    "utf8"
  );
  assert.match(notificationMigration, /after insert on public\.user_badges/i);
  assert.match(notificationMigration, /'badge_earned'/i);
  assert.match(notificationMigration, /on conflict do nothing/i);
  assert.match(sessionUi, /badge_earned[\s\S]*Crew Card/i);
  assert.match(pushFunction, /badge_earned[\s\S]*Nieuwe badge behaald/i);
});

test("Profielfoto gebruikt een ronde bijsnijder en heeft een eigen profielpermissie", async () => {
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");
  const accountScript = await readFile(path.join(rootDirectory, "app/account.js"), "utf8");
  const cropper = await readFile(path.join(rootDirectory, "app/avatarCropper.js"), "utf8");
  const profileService = await readFile(path.join(rootDirectory, "app/saas/profileService.js"), "utf8");
  const permissionMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608090003_profile_avatar_permissions.sql"),
    "utf8"
  );

  assert.match(accountHtml, /id="avatar-crop-dialog"/);
  assert.match(accountHtml, /id="avatar-crop-canvas"/);
  assert.match(accountHtml, /id="avatar-crop-zoom"/);
  assert.match(accountScript, /avatarCropper\.crop\(file\)/);
  assert.match(cropper, /OUTPUT_SIZE = 512/);
  assert.match(cropper, /pointermove/);
  assert.match(profileService, /avatar\.jpg/);
  assert.match(profileService, /avatar_url: versionedUrl/);
  assert.match(permissionMigration, /grant update \(avatar_url\) on table public\.profiles to authenticated/i);
});

test("gedeelde Crew Cards blijven voor eigenaar en ontvanger wederzijds beschikbaar", async () => {
  const migration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608090004_shared_crew_cards.sql"),
    "utf8"
  );
  assert.match(migration, /create or replace function public\.get_crew_member_card/);
  assert.match(migration, /s\.accepted_at is not null/);
  assert.match(migration, /s\.owner_id = auth\.uid\(\) and s\.recipient_id = p_user_id/);
  assert.match(migration, /create function public\.get_workday_share_participants/);
  assert.match(migration, /pi\.participant_id = auth\.uid\(\)/);
});

test("geclaimde uitnodigingen worden geaccepteerd en blijven de actieve gedeelde werkdag", async () => {
  const repairMigration = await readFile(
    path.join(rootDirectory, "supabase/migrations/202608090006_sharing_badge_repair.sql"),
    "utf8"
  );
  const workdaysScript = await readFile(path.join(rootDirectory, "app/workdays.js"), "utf8");
  const calculatorScript = await readFile(path.join(rootDirectory, "app/app.js"), "utf8");

  assert.match(repairMigration, /set accepted_at = coalesce\(accepted_at, delivered_at, created_at, now\(\)\)/i);
  assert.match(repairMigration, /create trigger mark_claimed_workday_share_accepted/i);
  assert.match(repairMigration, /select s\.recipient_id, false[\s\S]*s\.accepted_at is not null/i);
  assert.match(workdaysScript, /shareService\.claimInvite\(token\)[\s\S]*shareService\.accept\(shareId\)/i);
  assert.match(calculatorScript, /const activeShares = await findActiveReceivedShare\(\)[\s\S]*location\.replace\(`index\.html\?shared=/i);
  assert.doesNotMatch(calculatorScript, /activeShares\.length && !activeContextIsSuppressed\(\)/i);
});
