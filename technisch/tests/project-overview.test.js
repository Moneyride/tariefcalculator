import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../app/projects.js", import.meta.url), "utf8");

test("projecturen bevatten geen toekomstige of nog niet begonnen dagen", () => {
  const implementation = source.slice(source.indexOf("  function canCalculateDay("), source.indexOf("  function renderProjectBalance("));
  const context = vm.createContext({
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [2026, 9, 17, 12, 0])); } },
    isoDate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    storedDayData: day => day.calculationData,
    calculate: data => ({subtotalExVat: 600, totalHours: 12, overtimeHours: 2, overtimeAmount: 150, nightHours: 0, kilometers: 0, parkingAmount: 0, nightAmount: 0, droneTariffAmount: 0, ronin4dTariffAmount: 0, customEquipmentAmount: 0}),
    current: {project: {workRules: {}}}
  });
  vm.runInContext(implementation, context);
  const data = {startTime:"08:00", endTime:"20:00", rateMode:"day", rateAmount:450};
  const days = [
    {workDate:"2026-10-16", calculationData:data},
    {workDate:"2026-10-18", calculationData:data},
    {workDate:"2026-10-17", calculationData:{...data,startTime:"14:00"}}
  ];
  const actual = context.totals(days, {allowIncomplete:true});
  const forecast = context.totals(days, {allowIncomplete:true,includePlanning:true});
  assert.equal(actual.hours, 12);
  assert.equal(actual.overtime, 2);
  assert.equal(actual.overtimeAmount, 150);
  assert.equal(actual.amount, 600);
  assert.equal(forecast.hours, 12);
  assert.equal(forecast.amount, 1500);
  assert.equal(context.isPlannedDay(days[1]), true);
  assert.equal(context.isPlannedDay(days[2]), true);
});

test("overzicht toont saldo en bedrag zonder lege kostenposten of staffeltekst", () => {
  const start = source.indexOf("    const metrics = [", source.indexOf("function renderOverview("));
  const end = source.indexOf('    document.querySelector("#project-day-list")', start);
  const element = {innerHTML:""};
  const context = vm.createContext({
    earned: {hours:24,overtime:4,overtimeAmount:0,night:0,kilometers:0,parking:0,surcharges:0},
    total:{amount:900}, balance:{overtime:4,undertime:1.75,payableHours:2.25,estimatedAmount:151.875,settled:false},
    number: new Intl.NumberFormat("nl-NL"), euro: new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}),
    document:{querySelector:()=>element}
  });
  vm.runInContext(source.slice(start,end),context);
  assert.match(element.innerHTML,/Geregistreerde overuren/);
  assert.match(element.innerHTML,/Te verrekenen overuren/);
  assert.match(element.innerHTML,/2,25 uur/);
  assert.match(element.innerHTML,/Overurenbedrag \(voorlopig\)/);
  assert.doesNotMatch(element.innerHTML,/Nachturen|Parkeer|Kilometers|tegen 150%/);
});
