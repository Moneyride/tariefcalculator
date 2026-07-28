import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("../../app/liveWorkday.js");
await import("../../app/workdayNotifications.js");
await import("../../app/statsEngine.js");

const live = globalThis.OveruurtjeLiveWorkday;
const reminders = globalThis.OveruurtjeWorkdayNotifications;
const stats = globalThis.OveruurtjeStats;

test("tijdkeuze rondt de lokale tijd af naar het dichtstbijzijnde kwartier", () => {
  assert.equal(live.roundedCurrentTime(new Date(2026, 6, 27, 8, 7)), "08:00");
  assert.equal(live.roundedCurrentTime(new Date(2026, 6, 27, 8, 8)), "08:15");
  assert.equal(live.roundedCurrentTime(new Date(2026, 6, 27, 23, 58)), "00:00");
});

test("live eindtijd gebruikt tijdcode op 25 fps", () => {
  assert.equal(live.FRAMES_PER_SECOND, 25);
  assert.equal(live.formatTimecode(new Date(2026, 6, 27, 15, 53, 12, 0)), "15:53:12:00");
  assert.equal(live.formatTimecode(new Date(2026, 6, 27, 15, 53, 12, 520)), "15:53:12:13");
  assert.equal(live.formatTimecode(new Date(2026, 6, 27, 15, 53, 12, 999)), "15:53:12:24");
});

test("live werkdag toont verstreken kwartieren en trekt pauze af", () => {
  const state = live.getState({
    date: "2026-07-27",
    startTime: "08:00",
    endTime: "",
    breakMinutes: 30,
    now: new Date(2026, 6, 27, 15, 53)
  });
  assert.equal(state.active, true);
  assert.equal(state.elapsedMinutes, 465);
  assert.equal(state.workedMinutes, 435);
  assert.equal(state.label, "7 uur 15 minuten gewerkt");
  assert.equal(state.timecode, "15:53:00:00");
});

test("live werkdag loopt vandaag en gisteren, maar niet op oudere dagen", () => {
  const yesterday = live.getState({
    date: "2026-07-27", startTime: "08:00", endTime: "", now: new Date(2026, 6, 28, 0, 51)
  });
  assert.equal(yesterday.active, true);
  assert.equal(yesterday.elapsedMinutes, 1005);
  assert.equal(yesterday.timecode, "00:51:00:00");
  assert.equal(live.getState({
    date: "2026-07-26", startTime: "08:00", endTime: "", now: new Date(2026, 6, 28, 0, 51)
  }).active, false);
  assert.equal(live.getState({
    date: "2026-07-28", startTime: "00:00", endTime: "00:45", now: new Date(2026, 6, 28, 0, 51)
  }).active, false);
});

test("calculator start vandaag automatisch live zonder aparte liveknop", async () => {
  const html = await readFile(new URL("../../app/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../../app/app.js", import.meta.url), "utf8");

  assert.match(html, /name="endTime" value="" placeholder="Eindtijd kiezen"/);
  assert.doesNotMatch(html, /id="clear-end-time"|Live volgen|Later invullen/);
  assert.match(script, /async function stopLiveWorkdayAndCalculate/);
  assert.match(script, /endTimeField\.dataset\.timePicked = "true"/);
  assert.match(script, /function resumeLiveWorkday/);
  assert.match(script, /function updateResumeLiveAccess/);
  assert.match(script, /requestAnimationFrame\(\(\) => \{\s*liveWorkdayController\?\.update\(\)/);
  assert.match(html, /id="resume-live-workday" hidden/);
  assert.match(script, /Werkdag gestopt om/);
  assert.match(script, /endTimeIsFixed \? endTimeField\.value : ""/);
});

test("een opgeslagen werkdag wordt na terugkeer opnieuw aangeboden en live hervat", async () => {
  const script = await readFile(new URL("../../app/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(script, /overuurtjeTodayWorkdayPrompt/);
  assert.match(script, /if \(requested\) applyWorkdaySnapshot\(requested\)/);
  assert.match(script, /const existing = await listExistingDateEntries\(localDateValue\(\)\)/);
  assert.match(script, /updateResumeLiveAccess\(\)/);
});

test("live controller schakelt na een formulierwijziging direct naar 25 fps", () => {
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const delays = [];
  let state = {
    date: live.localDateValue(),
    startTime: "00:00",
    endTime: "01:00"
  };

  globalThis.document = { addEventListener() {}, visibilityState: "visible" };
  globalThis.setTimeout = (_callback, delay) => {
    delays.push(delay);
    return delays.length;
  };
  globalThis.clearTimeout = () => {};

  try {
    const controller = live.createController({
      read: () => state,
      render() {}
    });
    assert.ok(delays.at(-1) >= 1000);
    state = { ...state, endTime: "" };
    controller.update();
    assert.ok(delays.at(-1) <= 40);
    controller.stop();
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("herinneringen staan exact een kwartier voor overuren en nachtperiode", () => {
  const result = reminders.buildReminders({
    date: "2026-07-27",
    startTime: "14:00",
    breakMinutes: 30,
    normalDayHours: 10,
    enableNightTariff: true,
    nightStart: "00:00"
  });
  assert.equal(result[0].at.getTime(), new Date(2026, 6, 28, 0, 15).getTime());
  assert.equal(result[1].at.getTime(), new Date(2026, 6, 27, 23, 45).getTime());
});

test("dashboardstatistieken combineren periodes en persoonlijke records", () => {
  const records = [
    { date: "2026-07-27", startTime: "08:00", endTime: "18:00", totalHours: 10, overtimeHours: 0, nightHours: 0 },
    { date: "2026-07-28", startTime: "06:30", endTime: "22:30", totalHours: 16, overtimeHours: 6, nightHours: 0 },
    { date: "2026-07-20", startTime: "10:00", endTime: "02:00", totalHours: 16, overtimeHours: 6, nightHours: 2 }
  ];
  const result = stats.calculate(records, new Date(2026, 6, 29));
  assert.deepEqual(result.week, { workdays: 2, hours: 26, overtime: 6, night: 0 });
  assert.deepEqual(result.month, { workdays: 3, hours: 42, overtime: 12, night: 2 });
  assert.equal(result.personal.earliestStart.record.startTime, "06:30");
  assert.equal(result.personal.latestEnd.record.endTime, "02:00");
  assert.equal(result.personal.bestWeek.hours, 26);
});
