import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testsDirectory, "../..");
const analyticsSource = await readFile(path.join(rootDirectory, "app/analytics.js"), "utf8");

function runAnalytics(savedConsent) {
  const commands = [];
  const localStorage = {
    getItem: () => savedConsent,
    setItem: () => {}
  };
  const document = {
    cookie: "",
    head: { append: () => {} },
    readyState: "complete",
    querySelector: () => null
  };
  const window = {
    gtag: (...args) => commands.push(args)
  };
  const context = vm.createContext({
    window,
    document,
    location: { hostname: "localhost", protocol: "http:", reload: () => {} },
    localStorage,
    requestAnimationFrame: (callback) => callback(),
    setTimeout,
    clearTimeout,
    console
  });

  vm.runInContext(analyticsSource, context);
  return { analytics: window.OveruurtjeAnalytics, commands };
}

test("events worden niet verstuurd zonder analytics-toestemming", () => {
  const { analytics, commands } = runAnalytics(null);

  assert.equal(analytics.track("settings_opened"), false);
  assert.equal(commands.some(([command]) => command === "event"), false);
});

test("alleen toegestane parameters worden naar calculation_completed gestuurd", () => {
  const { analytics, commands } = runAnalytics("granted");

  assert.equal(analytics.track("calculation_completed", {
    department: "camera",
    total_hours: 11,
    overtime_hours: 1,
    night_hours: 0,
    drone: true,
    ronin: false,
    mileage: false,
    parking: false,
    day_rate: 450,
    subtotal: 517.5
  }), true);

  const eventCommand = commands.find(([command]) => command === "event");
  assert.deepEqual(Object.keys(eventCommand[2]).sort(), [
    "department",
    "drone",
    "mileage",
    "night_hours",
    "overtime_hours",
    "parking",
    "ronin",
    "total_hours"
  ]);
  assert.equal("day_rate" in eventCommand[2], false);
  assert.equal("subtotal" in eventCommand[2], false);
});

test("onbekende events worden geweigerd", () => {
  const { analytics, commands } = runAnalytics("granted");

  assert.equal(analytics.track("rate_entered", { value: 450 }), false);
  assert.equal(commands.some(([command]) => command === "event"), false);
});

test("alle afgesproken GA4-events worden ondersteund", () => {
  const { analytics, commands } = runAnalytics("granted");
  const eventNames = [
    "calculation_completed",
    "department_selected",
    "drone_enabled",
    "ronin4d_enabled",
    "mileage_enabled",
    "parking_enabled",
    "settings_opened",
    "buymeacoffee_clicked",
    "share_clicked"
  ];

  eventNames.forEach((eventName) => {
    assert.equal(analytics.track(eventName), true);
  });

  assert.deepEqual(
    commands.filter(([command]) => command === "event").map(([, eventName]) => eventName),
    eventNames
  );
});

test("Consent Mode default staat voor de analytics-module en appcode", async () => {
  const html = await readFile(path.join(rootDirectory, "app/index.html"), "utf8");
  const defaultConsent = html.indexOf('window.gtag("consent", "default"');
  const analyticsModule = html.indexOf('src="analytics.js');
  const appModule = html.indexOf('src="app.js');

  assert.ok(defaultConsent > -1);
  assert.ok(defaultConsent < analyticsModule);
  assert.ok(analyticsModule < appModule);
  assert.match(html, /analytics_storage:\s*"denied"/);
  assert.match(html, /ad_user_data:\s*"denied"/);
  assert.match(html, /ad_personalization:\s*"denied"/);
});
