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
      lines.push(line("normal_day", `${role} – draaidag ${label}`, 1, "dag", result.baseAmount, vat, source));
      const overtime = [
        [result.overtime10To12Hours, result.overtime10To12Amount, "Overuren 150%"],
        [result.overtimeFrom12Hours, result.overtimeFrom12Amount, "Overuren 200%"],
        [result.overtimeFrom14Hours, result.overtimeFrom14Amount, "Overuren 250%"]
      ];
      overtime.forEach(([hours, amount, description]) => {
        if (Number(hours) > 0) lines.push(line("overtime", `${description} – ${Number(hours).toLocaleString("nl-NL")} uur`, hours, "uur", Number(amount) / Number(hours), vat, source));
      });
      if (Number(result.nightHours) > 0) {
        lines.push(line("night_hours", `Nachttoeslag – ${Number(result.nightHours).toLocaleString("nl-NL")} uur`, result.nightHours, "uur", Number(result.nightAmount) / Number(result.nightHours), vat, source));
      }
    }
    if (Number(result.kilometers) > 0 && Number(result.kilometerAmount) > 0) {
      lines.push(line("mileage", `Kilometervergoeding – ${Number(result.kilometers).toLocaleString("nl-NL")} km`, result.kilometers, "km", result.settings.kilometerRate, vat, source));
    }
    if (Number(result.parkingAmount) > 0) lines.push(line("custom_extra", "Parkeer- en onkosten", 1, "stuk", result.parkingAmount, vat, source));
    if (Number(result.droneTariffAmount) > 0) lines.push(line("gear", "Drone", 1, "dag", result.droneTariffAmount, vat, source));
    if (Number(result.ronin4dTariffAmount) > 0) lines.push(line("gear", "Ronin 4D", 1, "dag", result.ronin4dTariffAmount, vat, source));
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
    const selected = (days || []).filter((day) => day.selected !== false);
    const models = selected.map((day) => {
      const data = day.calculationData || day.calculation_data || {};
      const sourceId = day.id;
      const model = fromWorkday({
        id: sourceId,
        workDate: day.workDate || day.work_date || data.date,
        calculationData: {
          ...data,
          date: day.workDate || day.work_date || data.date,
          clientName: project.clientName || project.client_name || data.clientName
        }
      });
      const source = { sourceType: "project_day", sourceId };
      return {
        ...model,
        sourceItems: [source],
        lineItems: model.lineItems.map((item) => ({ ...item, source }))
      };
    });
    return {
      schemaVersion: 1,
      sourceType: "project", sourceId: project.id,
      sourceItems: models.flatMap((model) => model.sourceItems.map((item) => ({ ...item, sourceType: "project_day" }))),
      date: new Date().toISOString().slice(0, 10),
      customer: { name: project.clientName || project.client_name || "", localKey: customerKey(project.clientName || project.client_name), key: customerKey(project.clientName || project.client_name) },
      project: { id: project.id, name: project.name || "Project" },
      reference: project.name || "Project",
      description: project.name || "Project",
      lineItems: models.flatMap((model) => model.lineItems)
    };
  }

  function withSourceItems(exportModel, selectedIds) {
    const ids = new Set(selectedIds || []);
    return {
      ...exportModel,
      sourceItems: exportModel.sourceItems.filter((item) => ids.has(item.sourceId)),
      lineItems: exportModel.lineItems.filter((item) => ids.has(item.source?.sourceId))
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
    customerKey
  });
})();
