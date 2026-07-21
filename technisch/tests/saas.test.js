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
    defaultHourlyRate: 52.5,
    mileageRate: 0.35,
    parkingEnabled: true,
    parkingDefaultAmount: 12.5,
    droneEnabled: true,
    roninEnabled: false
  });

  assert.equal(serialized.user_id, "user-1");
  assert.equal(serialized.default_department, "audio");
  assert.equal(serialized.default_hourly_rate, 52.5);
  assert.equal(serialized.parking_enabled, true);
  assert.equal(serialized.ronin_enabled, false);
  assert.ok(serialized.updated_at);
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
});

test("SaaS-services laden voor calculatorcode en accountpagina is aanwezig", async () => {
  const calculatorHtml = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const accountHtml = await readFile(path.join(rootDirectory, "app/account.html"), "utf8");

  assert.ok(calculatorHtml.indexOf("saas/authService.js") < calculatorHtml.indexOf("app.js"));
  assert.match(calculatorHtml, /id="account-login"/);
  assert.match(accountHtml, /Account &amp; instellingen/);
  assert.match(accountHtml, /data-subscription-upgrade/);
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
