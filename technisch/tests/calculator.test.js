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

test("16:00 tot 02:00 geeft pure nachturen 100% toeslag zodat ze totaal 200% waard zijn", () => {
  const result = calculate("16:00", "02:00");

  assert.equal(result.totalHours, 10);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.nightHours, 2);
  assert.equal(result.pureNightHours, 2);
  assert.equal(result.nightOvertimeHours, 0);
  assertMoney(result.nightAmount, 90);
  assertMoney(result.subtotalExVat, 540);
});

test("16:00 tot 03:00 berekent nacht-overuur-overlap met alleen extra nachttoeslag", () => {
  const result = calculate("16:00", "03:00");

  assert.equal(result.totalHours, 11);
  assert.equal(result.overtimeHours, 1);
  assert.equal(result.nightHours, 3);
  assert.equal(result.pureNightHours, 2);
  assert.equal(result.nightOvertimeHours, 1);
  assertMoney(result.overtimeAmount, 67.5);
  assertMoney(result.pureNightAmount, 90);
  assertMoney(result.overlapNightAmount, 67.5);
  assertMoney(result.nightAmount, 157.5);
  assertMoney(result.subtotalExVat, 675);
});

test("14:45 tot 00:30 berekent 0,5 pure nachturen", () => {
  const result = calculate("14:45", "00:30");

  assert.equal(result.totalHours, 9.75);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.nightHours, 0.5);
  assert.equal(result.pureNightHours, 0.5);
  assertMoney(result.nightAmount, 22.5);
  assertMoney(result.subtotalExVat, 472.5);
});

test("nachturen worden per begonnen kwartier afgerond", () => {
  const result = calculate("23:50", "00:01");

  assert.equal(result.totalHours, 11 / 60);
  assert.equal(result.nightHours, 0.25);
  assert.equal(result.pureNightHours, 0.25);
  assertMoney(result.nightAmount, 11.25);
});

test("nacht-overuur-overlap rondt naar begonnen kwartier en telt niet dubbel volledig", () => {
  const result = calculate("14:00", "00:01");

  assert.equal(result.totalHours, 10 + 1 / 60);
  assert.equal(result.nightHours, 0.25);
  assert.equal(result.nightOvertimeHours, 0.25);
  assert.equal(result.pureNightHours, 0);
  assertMoney(result.overtimeAmount, 1.13);
  assertMoney(result.overlapNightAmount, 16.88);
  assertMoney(result.nightAmount, 16.88);
});

test("nachttoeslag volgt zonder plafond het tarief van iedere overuurstaffel", () => {
  const result = calculate("12:00", "03:00", { enableOvertimeFrom14: true });

  assert.equal(result.nightOvertimeHours, 3);
  assert.equal(result.nightOvertimeSurchargeBreakdown.length, 2);
  assert.equal(result.nightOvertimeSurchargeBreakdown[0].surchargeFactor, 2);
  assert.equal(result.nightOvertimeSurchargeBreakdown[0].hours, 2);
  assertMoney(result.nightOvertimeSurchargeBreakdown[0].amount, 180);
  assert.equal(result.nightOvertimeSurchargeBreakdown[1].surchargeFactor, 2.5);
  assert.equal(result.nightOvertimeSurchargeBreakdown[1].hours, 1);
  assertMoney(result.nightOvertimeSurchargeBreakdown[1].amount, 112.5);
  assertMoney(result.overlapNightAmount, 292.5);
  assertMoney(result.subtotalExVat, 1170);
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

test("drone en Ronin 4D gebruiken de ingestelde toeslagbedragen", () => {
  const result = calculateTariff(
    {
      startTime: "08:00",
      endTime: "18:00",
      enableDroneTariff: true,
      enableRonin4dTariff: true
    },
    {
      ...DEFAULT_SETTINGS,
      droneTariffAmount: 65,
      ronin4dTariffAmount: 80
    }
  );

  assertMoney(result.droneTariffAmount, 65);
  assertMoney(result.ronin4dTariffAmount, 80);
  assertMoney(result.extraTariffAmount, 145);
  assertMoney(result.subtotalExVat, 595);
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

test("parkeer en onkosten tellen als ingevuld bedrag mee in totaal exclusief btw", () => {
  const result = calculateTariff(
    {
      startTime: "08:00",
      endTime: "18:00",
      enableParkingCosts: true,
      parkingCosts: 18.75
    },
    DEFAULT_SETTINGS
  );

  assertMoney(result.parkingAmount, 18.75);
  assertMoney(result.extraTariffAmount, 18.75);
  assertMoney(result.subtotalExVat, 468.75);
});

test("eigen apparatuur telt als vaste toeslag mee en niet als overuur", () => {
  const result = calculateTariff(
    {
      startTime: "08:00",
      endTime: "19:00",
      customEquipment: [
        { id: "light", name: "Lichtset", amount: 75, enabled: true },
        { id: "monitor", name: "Monitor", amount: 25, enabled: false }
      ]
    },
    DEFAULT_SETTINGS
  );

  assertMoney(result.customEquipmentAmount, 75);
  assert.equal(result.customEquipmentItems.length, 1);
  assertMoney(result.subtotalExVat, 592.5);
});

test("projectpauze wordt afgetrokken voordat overuren beginnen", () => {
  const result = calculateTariff({ startTime: "08:00", endTime: "19:00", breakMinutes: 60 }, DEFAULT_SETTINGS);
  assert.equal(result.totalHours, 10);
  assert.equal(result.overtimeHours, 0);
  assertMoney(result.subtotalExVat, 450);
});

test("uurtarief rekent gewerkte normale uren en overuren vanuit hetzelfde basistarief", () => {
  const result = calculateTariff(
    { startTime: "08:00", endTime: "19:00", rateMode: "hour", hourlyRate: 60 },
    { ...DEFAULT_SETTINGS, enableNightTariff: false }
  );
  assertMoney(result.baseAmount, 600);
  assertMoney(result.overtimeAmount, 90);
  assertMoney(result.subtotalExVat, 690);
});

test("uurtarief rekent minimaal het ingestelde aantal uren", () => {
  const result = calculateTariff(
    { startTime: "08:00", endTime: "11:00", rateMode: "hour", hourlyRate: 60 },
    { ...DEFAULT_SETTINGS, minimumHours: 6, enableNightTariff: false }
  );

  assert.equal(result.totalHours, 3);
  assert.equal(result.minimumHours, 6);
  assert.equal(result.minimumChargeApplied, true);
  assertMoney(result.baseAmount, 360);
  assertMoney(result.subtotalExVat, 360);
});

test("minimale afname telt overuren niet dubbel", () => {
  const result = calculateTariff(
    { startTime: "08:00", endTime: "19:00", rateMode: "hour", hourlyRate: 60 },
    { ...DEFAULT_SETTINGS, minimumHours: 12, enableNightTariff: false }
  );

  assert.equal(result.totalHours, 11);
  assertMoney(result.overtimeAmount, 90);
  assertMoney(result.baseAmount, 630);
  assertMoney(result.subtotalExVat, 720);
});

test("halve dag wordt nooit toegepast op een uurtarief", () => {
  const result = calculateTariff(
    { startTime: "08:00", endTime: "11:00", rateMode: "hour", hourlyRate: 60 },
    { ...DEFAULT_SETTINGS, minimumHours: 2, enableHalfDayUnder6Hours: true, enableNightTariff: false }
  );

  assert.equal(result.minimumChargeApplied, false);
  assertMoney(result.baseAmount, 180);
});

test("uurtarief kan zonder minimale afname worden berekend", () => {
  const result = calculateTariff(
    { startTime: "08:00", endTime: "10:00", rateMode: "hour", hourlyRate: 45 },
    { ...DEFAULT_SETTINGS, minimumHours: 0, enableNightTariff: false }
  );

  assert.equal(result.minimumHours, 0);
  assert.equal(result.minimumChargeApplied, false);
  assertMoney(result.baseAmount, 90);
  assertMoney(result.subtotalExVat, 90);
});

test("instelbare nachttoeslag gebruikt het gekozen percentage voor normale nachturen", () => {
  const result = calculate("16:00", "02:00", { nightSurchargePercent: 50 });

  assert.equal(result.pureNightHours, 2);
  assert.equal(result.settings.nightSurchargePercent, 50);
  assertMoney(result.nightAmount, 45);
  assertMoney(result.subtotalExVat, 495);
});

test("instelbare nachttoeslag volgt ook het tarief van een overlappend overuur", () => {
  const result = calculate("16:00", "03:00", { nightSurchargePercent: 50 });

  assert.equal(result.nightOvertimeHours, 1);
  assertMoney(result.overtimeAmount, 67.5);
  assertMoney(result.pureNightAmount, 45);
  assertMoney(result.overlapNightAmount, 33.75);
  assertMoney(result.subtotalExVat, 596.25);
});

test("reisdag binnen Europa rekent 75 procent van het dagtarief zonder overuren of nachttoeslag", () => {
  const result = calculateTariff(
    {
      startTime: "08:00",
      endTime: "23:00",
      enableTravelDay: true,
      travelRegion: "within_europe"
    },
    DEFAULT_SETTINGS
  );

  assert.equal(result.isTravelDay, true);
  assert.equal(result.travelPercent, 75);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.nightHours, 0);
  assertMoney(result.travelDayAmount, 337.5);
  assertMoney(result.subtotalExVat, 337.5);
});

test("reisdag buiten Europa gebruikt het ingestelde percentage en behoudt losse kosten", () => {
  const result = calculateTariff(
    {
      enableTravelDay: true,
      travelRegion: "outside_europe",
      enableKilometers: true,
      kilometers: 100,
      enableParkingCosts: true,
      parkingCosts: 20
    },
    { ...DEFAULT_SETTINGS, travelOutsideEuropePercent: 110, kilometerRate: 0.5 }
  );

  assert.equal(result.totalHours, 0);
  assert.equal(result.travelPercent, 110);
  assertMoney(result.travelDayAmount, 495);
  assertMoney(result.kilometerAmount, 50);
  assertMoney(result.parkingAmount, 20);
  assertMoney(result.subtotalExVat, 565);
});
