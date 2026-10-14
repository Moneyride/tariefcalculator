(function initializeAccountingExportModel() {
  "use strict";

  const calculate = globalThis.TariffCalculator?.calculateTariff;
  const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const dateLabel = (value) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(`${value}T12:00:00`));
  };
  const customerKey = (name) => String(name || "").trim().toLocaleLowerCase("nl-NL").replace(/\s+/g, " ");

  function normalizeSnapshot(snapshot = {}, overrides = {}) {
    if (snapshot.settings && snapshot.extras) return { ...snapshot, ...overrides };
    const rateMode = snapshot.rateMode === "hour" ? "hour" : "day";
    const normalDayHours = Number(snapshot.normalDayHours) || 10;
    const rateAmount = Number(snapshot.rateAmount) || 0;
    return {
      ...snapshot,
      ...overrides,
      workFunction: snapshot.workFunction || (snapshot.workFunctionName ? { name: snapshot.workFunctionName } : null),
      settings: {
        ...globalThis.TariffCalculator?.DEFAULT_SETTINGS,
        dayRate: rateMode === "day" ? rateAmount : Number(snapshot.dayRate) || 0,
        hourlyRate: rateMode === "hour" ? rateAmount : undefined,
        rateMode,
        normalDayHours,
        minimumHours: Number(snapshot.minimumHours) || 0,
        enableHalfDayUnder6Hours: Boolean(snapshot.enableHalfDayUnder6Hours),
        enableOvertime10To12: Boolean(snapshot.enableOvertime10To12),
        enableOvertimeFrom12: Boolean(snapshot.enableOvertimeFrom12),
        enableOvertimeFrom14: Boolean(snapshot.enableOvertimeFrom14),
        enableNightTariff: Boolean(snapshot.enableNightTariff),
        nightStart: snapshot.nightStart || "00:00",
        nightEnd: snapshot.nightEnd || "06:00",
        nightSurchargePercent: Number(snapshot.nightSurchargePercent ?? 100),
        travelWithinEuropePercent: Number(snapshot.travelWithinEuropePercent ?? 75),
        travelOutsideEuropePercent: Number(snapshot.travelOutsideEuropePercent ?? 100),
        kilometerRate: Number(snapshot.kilometerRate) || 0,
        droneTariffAmount: Number(snapshot.droneTariffAmount) || 0,
        ronin4dTariffAmount: Number(snapshot.ronin4dTariffAmount) || 0,
        vatPercent: Number(snapshot.vatPercent ?? globalThis.TariffCalculator?.DEFAULT_SETTINGS?.vatPercent ?? 21)
      },
      extras: {
        enableDroneTariff: Boolean(snapshot.enableDroneTariff),
        enableRonin4dTariff: Boolean(snapshot.enableRonin4dTariff),
        enableKilometers: Boolean(snapshot.enableKilometers),
        kilometers: Number(snapshot.kilometers) || 0,
        enableParkingCosts: Boolean(snapshot.enableParkingCosts),
        parkingCosts: Number(snapshot.parkingCosts) || 0,
        enableTravelDay: Boolean(snapshot.enableTravelDay),
        travelRegion: snapshot.travelRegion || "within_europe",
        travelPercent: Number(snapshot.travelPercent) || 0,
        customEquipment: snapshot.customEquipment || []
      }
    };
  }

  function calculationFromSnapshot(snapshot) {
    if (!calculate) throw new Error("De calculator is niet beschikbaar.");
    const settings = snapshot.settings || {};
    const extras = snapshot.extras || {};
    return calculate({
      startTime: snapshot.startTime,
      endTime: snapshot.endTime,
      breakMinutes: Number(snapshot.breakMinutes ?? settings.breakMinutes ?? 0),
      enableTimedBreak: Boolean(snapshot.enableTimedBreak),
      breakStartTime: snapshot.breakStartTime,
      breakEndTime: snapshot.breakEndTime,
      deferProjectOvertime: Boolean(snapshot.deferProjectOvertime),
      travelTimeDifferenceMinutes: Number(snapshot.travelTimeDifferenceMinutes) || 0,
      travelArrivalDayOffset: snapshot.travelArrivalDayOffset ?? "",
      rateMode: settings.rateMode || snapshot.rateMode || "day",
      hourlyRate: Number(settings.hourlyRate || snapshot.hourlyRate || 0),
      enableDroneTariff: Boolean(extras.enableDroneTariff),
      enableRonin4dTariff: Boolean(extras.enableRonin4dTariff),
      customEquipment: extras.customEquipment || [],
      enableKilometers: Boolean(extras.enableKilometers),
      kilometers: Number(extras.kilometers || 0),
      enableParkingCosts: Boolean(extras.enableParkingCosts),
      parkingCosts: Number(extras.parkingCosts || 0),
      enableTravelDay: Boolean(extras.enableTravelDay),
      travelRegion: extras.travelRegion || "within_europe",
      travelPercent: Number(extras.travelPercent || 0)
    }, settings);
  }

  function line(category, description, quantity, unit, unitPrice, vatPercentage, source) {
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (!(qty > 0) || !Number.isFinite(price) || Math.abs(qty * price) < 0.005) return null;
    return {
      category, description, quantity: qty, unit, unitPrice: roundMoney(price),
      vatPercentage: Number(vatPercentage || 0), lineTotal: roundMoney(qty * price), source
    };
  }

  function linesFromResult(result, snapshot, source) {
    const vat = Number(result.settings?.vatPercent || 0);
    const role = snapshot.workFunction?.name || snapshot.functionName || "Draaidag";
    const label = dateLabel(snapshot.date);
    const lines = [];
    if (result.isTravelDay) {
      lines.push(line(
        result.travelRegion === "outside_europe" ? "travel_day_non_eu" : "travel_day_eu",
        `Reisdag ${result.travelRegion === "outside_europe" ? "buiten Europa" : "binnen Europa"} (${Number(result.travelPercent)}%) – ${label}`,
        1, "dag", result.travelDayAmount, vat, source
      ));
    } else {
      const usesHalfDayRate = result.rateMode === "day" && result.baseAmount < result.settings.dayRate;
      const baseCategory = result.rateMode === "hour"
        ? (result.minimumChargeApplied ? "minimum_hours" : "hourly_rate")
        : (usesHalfDayRate ? "half_day" : "normal_day");
      const baseDescription = result.rateMode === "hour"
        ? `${role} – ${result.minimumChargeApplied ? "minimale afname" : "uurtarief"} ${label}`
        : `${role} – ${usesHalfDayRate ? "halve dag" : "draaidag"} ${label}`;
      lines.push(line(baseCategory, baseDescription, 1, "dag", result.baseAmount, vat, source));
      const overtime = [
        ["overtime_100", result.standardOvertimeHours, result.standardOvertimeAmount, "Overuren 100%"],
        ["overtime_150", result.overtime10To12Hours, result.overtime10To12Amount, "Overuren 150%"],
        ["overtime_200", result.overtimeFrom12Hours, result.overtimeFrom12Amount, "Overuren 200%"],
        ["overtime_250", result.overtimeFrom14Hours, result.overtimeFrom14Amount, "Overuren 250%"]
      ];
      overtime.forEach(([category, hours, amount, description]) => {
        if (result.overtimeDeferred) return;
        if (Number(hours) > 0) lines.push(line(category, `${description} – ${Number(hours).toLocaleString("nl-NL")} uur`, hours, "uur", Number(amount) / Number(hours), vat, source));
      });
      if (Number(result.nightHours) > 0) {
        lines.push(line("night_hours", `Nachttoeslag – ${Number(result.nightHours).toLocaleString("nl-NL")} uur`, result.nightHours, "uur", Number(result.nightAmount) / Number(result.nightHours), vat, source));
      }
    }
    if (Number(result.kilometers) > 0 && Number(result.kilometerAmount) > 0) {
      lines.push(line("mileage", `Kilometervergoeding – ${Number(result.kilometers).toLocaleString("nl-NL")} km`, result.kilometers, "km", result.settings.kilometerRate, vat, source));
    }
    if (Number(result.parkingAmount) > 0) lines.push(line("parking", "Parkeer- en onkosten", 1, "stuk", result.parkingAmount, vat, source));
    if (Number(result.droneTariffAmount) > 0) lines.push(line("drone", "Drone", 1, "dag", result.droneTariffAmount, vat, source));
    if (Number(result.ronin4dTariffAmount) > 0) lines.push(line("ronin", "Ronin 4D", 1, "dag", result.ronin4dTariffAmount, vat, source));
    (result.customEquipmentItems || []).forEach((item) => lines.push(line("gear", item.name, 1, "dag", item.amount, vat, source)));
    return lines.filter(Boolean);
  }

  function fromWorkday(workday) {
    const rawSnapshot = workday.calculationData || workday.calculation_data || workday;
    const snapshot = normalizeSnapshot(rawSnapshot, {
      date: rawSnapshot.date || workday.workDate || workday.work_date
    });
    const id = workday.id || snapshot.id;
    if (!id) throw new Error("Sla deze werkdag eerst op voordat je hem exporteert.");
    const result = calculationFromSnapshot(snapshot);
    const source = {
      sourceType: "workday",
      sourceId: id,
      date: snapshot.date || workday.workDate || workday.work_date || ""
    };
    return {
      schemaVersion: 1,
      sourceType: "workday", sourceId: id, sourceItems: [source],
      date: snapshot.date || workday.workDate || workday.work_date,
      customer: { name: snapshot.clientName || "", localKey: customerKey(snapshot.clientName), key: customerKey(snapshot.clientName) },
      project: null,
      reference: snapshot.workdayName || `Werkdag ${snapshot.date || ""}`,
      description: snapshot.workdayName || "Werkdag",
      lineItems: linesFromResult(result, snapshot, source)
    };
  }

  function fromProject(project, days) {
    const balancing = Boolean(project.workRules?.balanceOvertime);
    const balance = balancing ? projectBalance(project, days) : null;
    const selected = (days || []).filter((day) => day.selected !== false);
    const models = selected.map((day) => {
      const data = day.calculationData || day.calculation_data || {};
      const sourceId = day.id;
      const model = fromWorkday({
        id: sourceId,
        workDate: day.workDate || day.work_date || data.date,
        calculationData: {
          ...data,
          deferProjectOvertime: balancing,
          date: day.workDate || day.work_date || data.date,
          clientName: project.clientName || project.client_name || data.clientName
        }
      });
      const source = {
        sourceType: "project_day",
        sourceId,
        date: day.workDate || day.work_date || data.date || ""
      };
      return {
        ...model,
        sourceItems: [source],
        lineItems: model.lineItems.map((item) => ({ ...item, source }))
      };
    });
    if (balancing && balance.settled && balance.amount > 0) {
      if (selected.length !== (days || []).length) throw new Error("Exporteer alle projectdagen samen om het verrekende urensaldo mee te nemen.");
      const target = models.at(-1);
      balance.bands.filter(band => band.remaining > 0).forEach(band => {
        const item = line(`overtime_${band.percent}`, `Urensaldo project ${band.percent}% – ${band.remaining.toLocaleString("nl-NL")} uur`, band.remaining, "uur", band.unitPrice, band.vatPercent, target.sourceItems[0]);
        if (item) target.lineItems.push({ ...item, projectSettlement: true });
      });
    }
    return {
      schemaVersion: 1,
      sourceType: "project", sourceId: project.id,
      requiresFullProject: Boolean(balancing && balance.settled && balance.amount > 0),
      sourceItems: models.flatMap((model) => model.sourceItems.map((item) => ({ ...item, sourceType: "project_day" }))),
      date: new Date().toISOString().slice(0, 10),
      customer: { name: project.clientName || project.client_name || "", localKey: customerKey(project.clientName || project.client_name), key: customerKey(project.clientName || project.client_name) },
      project: { id: project.id, name: project.name || "Project" },
      reference: project.name || "Project",
      description: project.name || "Project",
      lineItems: models.flatMap((model) => model.lineItems)
    };
  }

  function projectBalance(project, days, now = new Date()) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const sorted = [...(days || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const prepared = sorted.map(day => {
      const snapshot = normalizeSnapshot(day.calculationData || day.calculation_data || {});
      const result = snapshot.startTime && snapshot.endTime ? calculationFromSnapshot({ ...snapshot, deferProjectOvertime: true }) : null;
      return { day, snapshot, result, normal: Number(snapshot.settings.normalDayHours) || 10 };
    });
    const signature = JSON.stringify(prepared.map(({ day, snapshot, result, normal }) => [
      day.id, day.workDate || day.work_date, snapshot.startTime || "", snapshot.endTime || "", normal,
      snapshot.enableTimedBreak ? [snapshot.breakStartTime || "", snapshot.breakEndTime || ""] : null,
      Number(snapshot.travelTimeDifferenceMinutes) || 0, String(snapshot.travelArrivalDayOffset ?? ""),
      result && [result.totalHours, result.hourlyRate, result.baseAmount, result.nightAmount, result.extraTariffAmount,
        result.travelPercent, result.breakMinutes, result.customEquipmentItems,
        globalThis.TariffCalculator.calculateOvertimeAmount(result.totalHours, result.hourlyRate, result.settings),
        Boolean(result.settings.enableOvertime10To12 || result.settings.enableOvertimeFrom12 || result.settings.enableOvertimeFrom14)]
    ]));
    const entries = prepared.filter(({ day, result }) => result && (day.workDate || day.work_date) <= today);
    const overtime = entries.reduce((sum, item) => sum + Math.max(0, item.result.totalHours - item.normal), 0);
    const undertime = entries.reduce((sum, item) => sum + Math.max(0, item.normal - item.result.totalHours), 0);
    const complete = sorted.length > 0 && entries.length === sorted.length;
    const payableHours = Math.max(0, overtime - undertime);
    const bands = entries.flatMap(({ result }) => {
      const settings = result.settings;
      if (!settings.enableOvertime10To12 && !settings.enableOvertimeFrom12 && !settings.enableOvertimeFrom14) return [];
      const rates = globalThis.TariffCalculator.calculateOvertimeAmount(result.totalHours, result.hourlyRate, settings);
      return [["standardOvertime", 100], ["overtime10To12", 150], ["overtimeFrom12", 200], ["overtimeFrom14", 250]]
        .map(([key, percent]) => ({ percent, hours: rates[`${key}Hours`], remaining: rates[`${key}Hours`], unitPrice: result.hourlyRate * percent / 100, vatPercent: settings.vatPercent }))
        .filter(band => band.hours > 0);
    }).sort((a, b) => b.percent - a.percent || b.unitPrice - a.unitPrice);
    let credit = undertime;
    for (const band of bands) {
      const removed = Math.min(credit, band.hours);
      band.remaining -= removed;
      credit -= removed;
    }
    const settled = Boolean(complete && project.workRules?.settlement?.signature === signature);
    const estimatedAmount = roundMoney(bands.reduce((sum, band) => sum + band.remaining * band.unitPrice, 0));
    return { overtime, undertime, payableHours, complete, settled, signature, bands, estimatedAmount, amount: settled ? estimatedAmount : 0 };
  }

  function withSourceItems(exportModel, selectedIds) {
    const ids = new Set(selectedIds || []);
    const partialSettlement = exportModel.requiresFullProject && exportModel.sourceItems.some(item => !ids.has(item.sourceId));
    return {
      ...exportModel,
      selectionError: partialSettlement ? "Selecteer alle projectdagen om het verrekende urensaldo correct te exporteren." : "",
      sourceItems: exportModel.sourceItems.filter((item) => ids.has(item.sourceId)),
      lineItems: exportModel.lineItems.filter((item) => ids.has(item.source?.sourceId) && !(partialSettlement && item.projectSettlement))
    };
  }

  function summarizeTotals(lineItems = []) {
    const vatByPercentage = new Map();
    const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
    lineItems.forEach((item) => {
      const percentage = Number(item.vatPercentage || 0);
      const vat = Number(item.lineTotal || 0) * percentage / 100;
      vatByPercentage.set(percentage, (vatByPercentage.get(percentage) || 0) + vat);
    });
    const vatLines = [...vatByPercentage.entries()]
      .sort(([first], [second]) => second - first)
      .map(([percentage, amount]) => ({ percentage, amount: roundMoney(amount) }));
    const vatTotal = roundMoney(vatLines.reduce((sum, item) => sum + item.amount, 0));
    return { subtotal, vatLines, vatTotal, total: roundMoney(subtotal + vatTotal) };
  }

  globalThis.OveruurtjeAccountingExport = Object.freeze({
    fromWorkday,
    fromProject,
    withSourceItems,
    summarizeTotals,
    projectBalance,
    customerKey
  });
})();
