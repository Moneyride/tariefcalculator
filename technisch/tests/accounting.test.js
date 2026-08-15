import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
await import(path.join(root, "app/calculator.js"));
await import(path.join(root, "app/accountingExportModel.js"));

const calculator = globalThis.TariffCalculator;
const accounting = globalThis.OveruurtjeAccountingExport;

function snapshot(overrides = {}) {
  return {
    date: "2026-08-14",
    workdayName: "Commercial",
    clientName: "Nivo",
    startTime: "08:00",
    endTime: "22:00",
    breakMinutes: 0,
    workFunction: { name: "Cameraman" },
    settings: {
      ...calculator.DEFAULT_SETTINGS,
      dayRate: 450,
      normalDayHours: 10,
      enableOvertime10To12: true,
      enableOvertimeFrom12: true,
      enableNightTariff: false,
      kilometerRate: 0.35,
      vatPercent: 21
    },
    extras: {
      enableKilometers: true,
      kilometers: 124,
      enableParkingCosts: false,
      enableDroneTariff: false,
      enableRonin4dTariff: false,
      enableTravelDay: false,
      customEquipment: [{ id: "fx9", name: "Sony FX9", amount: 75, enabled: true }]
    },
    ...overrides
  };
}

test("werkdag gebruikt bestaande calculator voor professionele factuurregels", () => {
  const model = accounting.fromWorkday({
    id: "11111111-1111-4111-8111-111111111111",
    calculationData: snapshot()
  });
  assert.equal(model.customer.name, "Nivo");
  assert.ok(model.lineItems.some((line) => line.category === "normal_day" && line.description.includes("Cameraman")));
  assert.ok(model.lineItems.some((line) => line.category === "overtime"));
  assert.ok(model.lineItems.some((line) => line.category === "mileage" && line.quantity === 124));
  assert.ok(model.lineItems.some((line) => line.category === "gear" && line.description === "Sony FX9"));
  assert.ok(model.lineItems.every((line) => !line.description.includes("normal_day")));
});

test("reisdag onderdrukt overuren en nachttoeslag, maar behoudt losse kosten", () => {
  const travel = snapshot({
    startTime: "04:00",
    endTime: "23:00",
    settings: { ...snapshot().settings, enableNightTariff: true },
    extras: {
      ...snapshot().extras,
      enableTravelDay: true,
      travelRegion: "outside_europe",
      travelPercent: 100,
      enableParkingCosts: true,
      parkingCosts: 18
    }
  });
  const model = accounting.fromWorkday({ id: "22222222-2222-4222-8222-222222222222", calculationData: travel });
  assert.ok(model.lineItems.some((line) => line.category === "travel_day_non_eu" && line.lineTotal === 450));
  assert.equal(model.lineItems.some((line) => line.category === "overtime"), false);
  assert.equal(model.lineItems.some((line) => line.category === "night_hours"), false);
  assert.ok(model.lineItems.some((line) => line.category === "custom_extra" && line.lineTotal === 18));
});

test("projectfilter neemt alleen geselecteerde werkdagen mee", () => {
  const project = { id: "33333333-3333-4333-8333-333333333333", name: "Productie X", clientName: "Nivo" };
  const days = [
    { id: "44444444-4444-4444-8444-444444444444", workDate: "2026-08-12", calculationData: snapshot({ date: "2026-08-12" }) },
    { id: "55555555-5555-4555-8555-555555555555", workDate: "2026-08-13", calculationData: snapshot({ date: "2026-08-13" }) }
  ];
  const model = accounting.fromProject(project, days);
  const filtered = accounting.withSourceItems(model, [days[1].id]);
  assert.deepEqual(filtered.sourceItems.map((item) => item.sourceId), [days[1].id]);
  assert.ok(filtered.lineItems.length > 0);
  assert.ok(filtered.lineItems.every((item) => item.source.sourceId === days[1].id));
});

test("backend bewaart secrets buiten clientpolicies en maakt nooit automatisch verzending aan", () => {
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/202608150001_accounting_integrations.sql"), "utf8");
  const edge = fs.readFileSync(path.join(root, "supabase/functions/accounting-moneybird/index.ts"), "utf8");
  assert.match(migration, /revoke all on public\.accounting_credentials from anon, authenticated/i);
  assert.match(migration, /unique \(user_id, provider, idempotency_key\)/i);
  assert.match(edge, /scope: "sales_invoices settings"/);
  assert.match(edge, /sales_invoices\/find_by_reference/);
  assert.match(edge, /sales_invoices\.json/);
  assert.match(edge, /accounting_exports"\)\.insert\(exportRecord\)/);
  assert.match(edge, /error\?\.code === "23505"/);
  assert.doesNotMatch(edge, /accounting_exports"\)\.upsert\(exportRecord/);
  assert.doesNotMatch(edge, /send_invoice/);
});
