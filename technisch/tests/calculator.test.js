import test from "node:test";
import assert from "node:assert/strict";
import "../../app/calculator.js";

const { DEFAULT_SETTINGS, calculateTariff } = globalThis.TariffCalculator;

const MONEY_PRECISION = 2;

function calculate(startTime, endTime, settings = {}) {
  return calculateTariff({ startTime, endTime }, { ...DEFAULT_SETTINGS, ...settings });
}

function assertMoney(actual, expected) {
  assert.equal(Number(actual.toFixed(MONEY_PRECISION)), expected);
}

test("08:00 tot 22:00 berekent 4 overuren en €765 exclusief btw", () => {
  const result = calculate("08:00", "22:00");

  assert.equal(result.totalHours, 14);
  assert.equal(result.overtimeHours, 4);
  assert.equal(result.firstOvertimeHours, 2);
  assert.equal(result.nextOvertimeHours, 2);
  assertMoney(result.overtimeAmount, 315);
  assertMoney(result.subtotalExVat, 765);
});

test("16:00 tot 02:00 berekent 2 pure nachturen zonder overuren", () => {
  const result = calculate("16:00", "02:00");

  assert.equal(result.totalHours, 10);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.nightHours, 2);
  assert.equal(result.pureNightHours, 2);
  assert.equal(result.nightOvertimeHours, 0);
  assertMoney(result.nightAmount, 180);
  assertMoney(result.subtotalExVat, 630);
});

test("16:00 tot 03:00 berekent nacht-overuur-overlap met alleen extra nachttoeslag", () => {
  const result = calculate("16:00", "03:00");

  assert.equal(result.totalHours, 11);
  assert.equal(result.overtimeHours, 1);
  assert.equal(result.nightHours, 3);
  assert.equal(result.pureNightHours, 2);
  assert.equal(result.nightOvertimeHours, 1);
  assertMoney(result.overtimeAmount, 67.5);
  assertMoney(result.nightAmount, 225);
  assertMoney(result.subtotalExVat, 742.5);
});

test("14:45 tot 00:30 berekent 0,5 pure nachturen", () => {
  const result = calculate("14:45", "00:30");

  assert.equal(result.totalHours, 9.75);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.nightHours, 0.5);
  assert.equal(result.pureNightHours, 0.5);
  assertMoney(result.nightAmount, 45);
  assertMoney(result.subtotalExVat, 495);
});

test("nachturen worden per begonnen kwartier afgerond", () => {
  const result = calculate("23:50", "00:01");

  assert.equal(result.totalHours, 11 / 60);
  assert.equal(result.nightHours, 0.25);
  assert.equal(result.pureNightHours, 0.25);
  assertMoney(result.nightAmount, 22.5);
});

test("nacht-overuur-overlap rondt naar begonnen kwartier en telt niet dubbel volledig", () => {
  const result = calculate("14:00", "00:01");

  assert.equal(result.totalHours, 10 + 1 / 60);
  assert.equal(result.nightHours, 0.25);
  assert.equal(result.nightOvertimeHours, 0.25);
  assert.equal(result.pureNightHours, 0);
  assertMoney(result.overtimeAmount, 1.13);
  assertMoney(result.nightAmount, 11.25);
});

test("overuren vanaf 14 uur werktijd kunnen tegen 250% worden gerekend", () => {
  const result = calculate("08:00", "23:00", { enableOvertimeFrom14: true });

  assert.equal(result.totalHours, 15);
  assert.equal(result.overtime10To12Hours, 2);
  assert.equal(result.overtimeFrom12Hours, 2);
  assert.equal(result.overtimeFrom14Hours, 1);
  assertMoney(result.overtimeAmount, 427.5);
});

test("halve dag rekent 75 procent basisvergoeding bij maximaal 6 uur werktijd", () => {
  const result = calculate("08:00", "14:00", { enableHalfDayUnder6Hours: true });

  assert.equal(result.totalHours, 6);
  assertMoney(result.baseAmount, 337.5);
  assertMoney(result.subtotalExVat, 337.5);
});

test("meer dan 6 uur gebruikt automatisch het minimale volledige dagtarief", () => {
  const result = calculate("08:00", "14:15", { enableHalfDayUnder6Hours: true });

  assert.equal(result.totalHours, 6.25);
  assert.equal(result.overtimeHours, 0);
  assertMoney(result.baseAmount, 450);
  assertMoney(result.subtotalExVat, 450);
});

test("zonder overuur-checkboxes worden overuren tegen 100 procent gerekend", () => {
  const result = calculate("08:00", "20:00", {
    enableOvertime10To12: false,
    enableOvertimeFrom12: false,
    enableOvertimeFrom14: false
  });

  assert.equal(result.totalHours, 12);
  assert.equal(result.overtimeHours, 2);
  assert.equal(result.standardOvertimeHours, 2);
  assertMoney(result.overtimeAmount, 90);
  assertMoney(result.subtotalExVat, 540);
});

test("alleen 150 procent aangevinkt rekent alle overuren tegen 150 procent", () => {
  const result = calculate("08:00", "22:00", {
    enableOvertime10To12: true,
    enableOvertimeFrom12: false,
    enableOvertimeFrom14: false
  });

  assert.equal(result.totalHours, 14);
  assert.equal(result.overtimeHours, 4);
  assert.equal(result.overtime10To12Hours, 4);
  assert.equal(result.overtimeFrom12Hours, 0);
  assertMoney(result.overtimeAmount, 270);
  assertMoney(result.subtotalExVat, 720);
});

test("200 procent neemt pas vanaf 12 uur werktijd over als die checkbox aan staat", () => {
  const result = calculate("08:00", "23:00", {
    enableOvertime10To12: true,
    enableOvertimeFrom12: true,
    enableOvertimeFrom14: false
  });

  assert.equal(result.totalHours, 15);
  assert.equal(result.overtime10To12Hours, 2);
  assert.equal(result.overtimeFrom12Hours, 3);
  assert.equal(result.overtimeFrom14Hours, 0);
  assertMoney(result.overtimeAmount, 405);
});

test("12 uur werkdag stelt de overuurgrens uit tot 12 uur werktijd", () => {
  const result = calculate("08:00", "21:00", {
    normalDayHours: 12,
    enableOvertime10To12: true,
    enableOvertimeFrom12: true,
    enableOvertimeFrom14: false
  });

  assert.equal(result.totalHours, 13);
  assert.equal(result.overtimeHours, 1);
  assert.equal(result.overtimeFrom12Hours, 1);
  assertMoney(result.overtimeAmount, 75);
  assertMoney(result.subtotalExVat, 525);
});

test("drone en Ronin 4D tarief tellen als vaste toeslag mee in totaal exclusief btw", () => {
  const result = calculateTariff(
    {
      startTime: "08:00",
      endTime: "18:00",
      enableDroneTariff: true,
      enableRonin4dTariff: true
    },
    DEFAULT_SETTINGS
  );

  assertMoney(result.droneTariffAmount, 50);
  assertMoney(result.ronin4dTariffAmount, 50);
  assertMoney(result.extraTariffAmount, 100);
  assertMoney(result.subtotalExVat, 550);
  assertMoney(result.vatAmount, 115.5);
  assertMoney(result.totalIncVat, 665.5);
});

test("kilometers gebruiken het ingestelde bedrag per gereden kilometer", () => {
  const result = calculateTariff(
    {
      startTime: "08:00",
      endTime: "18:00",
      enableKilometers: true,
      kilometers: 120
    },
    { ...DEFAULT_SETTINGS, kilometerRate: 0.6 }
  );

  assert.equal(result.kilometers, 120);
  assertMoney(result.kilometerAmount, 72);
  assertMoney(result.subtotalExVat, 522);
});
