const { DEFAULT_SETTINGS, calculateTariff } = globalThis.TariffCalculator;

const SETTINGS_KEY = "cameraTariefCalculatorSettings";
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const QUARTER_HOURS = ["00", "15", "30", "45"];

const form = document.querySelector("#calculator-form");
const settingsForm = document.querySelector("#settings-form");
const nextDayNotice = document.querySelector("#next-day-notice");
const calculationStatus = document.querySelector("#calculation-status");
const recalculateButton = document.querySelector("#recalculate");
const copyButton = document.querySelector("#copy-summary");
const pdfButton = document.querySelector("#save-pdf");
const saveSettingsButton = document.querySelector("#save-settings");
const copyStatus = document.querySelector("#copy-status");
const settingsStatus = document.querySelector("#settings-status");
const details = document.querySelector("#settings-panel");
const accountSettingsEntry = document.querySelector("#account-settings-entry");
const planningGrid = document.querySelector(".planning-grid");
const planningBreakField = document.querySelector("#planning-break-field");
const kilometerInput = document.querySelector("#kilometer-input");
const parkingInput = document.querySelector("#parking-input");
const inputOptions = document.querySelector(".input-options");
const departmentSwitch = document.querySelector(".department-switch");
const projectCreateLink = document.querySelector("#project-create-link");
const workdaySaveButton = document.querySelector("#save-workday");
const workdaySaveLabel = workdaySaveButton?.querySelector("[data-workday-save-label]");
const workdaySaveHint = workdaySaveButton?.querySelector("[data-workday-save-hint]");
const workdaySaveBadge = workdaySaveButton?.querySelector("[data-workday-save-badge]");
const clearEndTimeButton = document.querySelector("#clear-end-time");
const duplicateWorkdayDialog = document.querySelector("#duplicate-workday-dialog");
const todayWorkdayDialog = document.querySelector("#today-workday-dialog");
const droneOption = document.querySelector("#drone-option");
const roninOption = document.querySelector("#ronin-option");
const customEquipmentOptions = document.querySelector("#custom-equipment-options");
const customEquipmentResults = document.querySelector("#custom-equipment-results");
const droneResultRow = document.querySelector('[data-result="droneTariffAmount"]').closest("div");
const roninResultRow = document.querySelector('[data-result="ronin4dTariffAmount"]').closest("div");
const shareButton = document.querySelector("#share-site");
const analytics = globalThis.OveruurtjeAnalytics;
const accountSettingsService = globalThis.OveruurtjeSettings;
const equipmentService = globalThis.OveruurtjeEquipment;
const workdayService = globalThis.OveruurtjeWorkdays;
const sessionUi = globalThis.OveruurtjeSessionUI;

const SHARE_URL = "https://overuurtje.nl";
const SHARE_TEXT = "Bereken eenvoudig je cameraman-, geluidsman- en productietarieven met Overuurtje.nl.";

const euroFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR"
});

const numberFormatter = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

let calculationIsStale = false;
let latestResult = null;
let currentAccountUser = null;
let currentUserContext = null;
let currentAccountSettings = null;
let accountEquipmentVisibility = null;
let equipmentTariffs = {
  drone: DEFAULT_SETTINGS.droneTariffAmount,
  ronin: DEFAULT_SETTINGS.ronin4dTariffAmount
};
let customEquipment = [];
let hydratedAccountUserId = null;
let cloudSyncTimer = null;
let currentWorkdayId = null;
let pendingDuplicateWorkday = null;
let todayWorkday = null;
let workdayContextInitializedFor = null;

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function openNativeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeNativeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function getSavedSettings() {
  try {
    return { rateMode: "day", hourlyRate: DEFAULT_SETTINGS.dayRate / DEFAULT_SETTINGS.normalDayHours, enableBreak: false, breakMinutes: 0, ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { rateMode: "day", hourlyRate: DEFAULT_SETTINGS.dayRate / DEFAULT_SETTINGS.normalDayHours, enableBreak: false, breakMinutes: 0, ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function readNumber(formData, name) {
  return Number(String(formData.get(name)).replace(",", "."));
}

function readCheckbox(formData, name) {
  return formData.get(name) === "on";
}

function getSettingsFromForm() {
  const formData = new FormData(settingsForm);
  const calculatorData = new FormData(form);
  const enableBreak = readCheckbox(formData, "enableBreak");
  return {
    dayRate: readNumber(formData, "dayRate"),
    rateMode: formData.get("rateMode") === "hour" ? "hour" : "day",
    hourlyRate: readNumber(formData, "hourlyRate"),
    enableBreak,
    breakMinutes: enableBreak ? readNumber(calculatorData, "breakMinutes") : 0,
    normalDayHours: readNumber(formData, "normalDayHours"),
    vatPercent: DEFAULT_SETTINGS.vatPercent,
    enableHalfDayUnder6Hours: readCheckbox(formData, "enableHalfDayUnder6Hours"),
    enableOvertime10To12: readCheckbox(formData, "enableOvertime10To12"),
    enableOvertimeFrom12: readCheckbox(formData, "enableOvertimeFrom12"),
    enableOvertimeFrom14: readCheckbox(formData, "enableOvertimeFrom14"),
    enableNightTariff: readCheckbox(formData, "enableNightTariff"),
    pureNightSurchargeFactor: DEFAULT_SETTINGS.pureNightSurchargeFactor,
    nightOverlapSurchargeFactor: DEFAULT_SETTINGS.nightOverlapSurchargeFactor,
    nightStart: formData.get("nightStart"),
    nightEnd: formData.get("nightEnd"),
    nightRoundingMinutes: DEFAULT_SETTINGS.nightRoundingMinutes,
    droneTariffAmount: equipmentTariffs.drone,
    ronin4dTariffAmount: equipmentTariffs.ronin,
    kilometerRate: readNumber(formData, "kilometerRate")
  };
}

function populateSettings(settings) {
  Object.entries(settings).forEach(([key, value]) => {
    const field = settingsForm.elements.namedItem(key);
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value;
    }
  });
  const breakField = form.elements.namedItem("breakMinutes");
  if (breakField && Number.isFinite(Number(settings.breakMinutes))) {
    breakField.value = String(settings.breakMinutes);
  }
}

function getAccountSettingsSnapshot() {
  const settings = getSettingsFromForm();
  const department = form.elements.namedItem("department").value || "camera";
  return {
    defaultDepartment: department,
    defaultDayRate: settings.dayRate,
    defaultRateMode: settings.rateMode,
    defaultHourlyRate: settings.hourlyRate,
    defaultBreakMinutes: 0,
    enableBreak: settings.enableBreak,
    normalDayHours: settings.normalDayHours,
    enableHalfDayUnder6Hours: settings.enableHalfDayUnder6Hours,
    enableOvertime10To12: settings.enableOvertime10To12,
    enableOvertimeFrom12: settings.enableOvertimeFrom12,
    enableOvertimeFrom14: settings.enableOvertimeFrom14,
    enableNightTariff: settings.enableNightTariff,
    nightStart: settings.nightStart,
    nightEnd: settings.nightEnd,
    mileageRate: settings.kilometerRate,
    parkingDefaultAmount: currentAccountSettings?.parkingDefaultAmount || 0,
    droneVisible: currentAccountSettings?.droneVisible ?? false,
    roninVisible: currentAccountSettings?.roninVisible ?? false,
    droneTariffAmount: currentAccountSettings?.droneTariffAmount ?? equipmentTariffs.drone,
    roninTariffAmount: currentAccountSettings?.roninTariffAmount ?? equipmentTariffs.ronin,
    preferences: currentAccountSettings?.preferences || {}
  };
}

function applyAccountSettings(accountSettings, isPro) {
  if (!accountSettings) return;
  currentAccountSettings = accountSettings;
  accountEquipmentVisibility = isPro
    ? { drone: accountSettings.droneVisible, ronin: accountSettings.roninVisible }
    : null;
  equipmentTariffs = {
    drone: accountSettings.droneTariffAmount,
    ronin: accountSettings.roninTariffAmount
  };
  const localSettings = getSettingsFromForm();
  populateSettings({
    ...localSettings,
    dayRate: accountSettings.defaultDayRate,
    rateMode: accountSettings.defaultRateMode,
    hourlyRate: accountSettings.defaultHourlyRate,
    enableBreak: accountSettings.enableBreak,
    breakMinutes: 0,
    normalDayHours: accountSettings.normalDayHours,
    enableHalfDayUnder6Hours: accountSettings.enableHalfDayUnder6Hours,
    enableOvertime10To12: accountSettings.enableOvertime10To12,
    enableOvertimeFrom12: accountSettings.enableOvertimeFrom12,
    enableOvertimeFrom14: accountSettings.enableOvertimeFrom14,
    enableNightTariff: accountSettings.enableNightTariff,
    nightStart: accountSettings.nightStart,
    nightEnd: accountSettings.nightEnd,
    kilometerRate: accountSettings.mileageRate
  });

  const departmentField = form.querySelector(`input[name="department"][value="${accountSettings.defaultDepartment}"]`);
  if (departmentField) departmentField.checked = true;
  departmentSwitch.classList.add("is-account-locked");
  departmentSwitch.setAttribute("aria-disabled", "true");
  updateProjectCreateAccess(isPro);
  departmentSwitch.querySelectorAll(".department-choice").forEach((choice) => {
    const input = choice.querySelector("input");
    choice.hidden = !input.checked;
    input.disabled = !input.checked;
  });
  if (isPro) {
    form.elements.namedItem("enableDroneTariff").checked = false;
    form.elements.namedItem("enableRonin4dTariff").checked = false;
  }
  form.elements.namedItem("parkingCosts").value = "0";
  updateDepartmentVisibility();
  updateKilometerVisibility();
  updateParkingVisibility();
  updateNightSettingsVisibility();
  updateRateSettingsVisibility();
  updatePauseVisibility();
  updateCalculation();
}

function renderCustomEquipment(items) {
  customEquipment = items.filter((item) => item.isVisible);
  customEquipmentOptions.replaceChildren(...customEquipment.map((item) => {
    const option = document.createElement("div");
    option.className = "extra-option custom-equipment-option";
    option.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox" data-custom-equipment-id="${item.id}">
        <span></span>
      </label>
    `;
    option.querySelector("span").textContent = item.name;
    return option;
  }));
}

function buildWorkdaySnapshot() {
  const formData = new FormData(form);
  const settings = getSettingsFromForm();
  const endTime = form.elements.namedItem("endTime").value;
  return {
    schemaVersion: 1,
    date: form.elements.namedItem("date").value,
    department: formData.get("department") || "camera",
    startTime: form.elements.namedItem("startTime").value,
    endTime,
    breakMinutes: settings.breakMinutes,
    settings,
    extras: {
      enableDroneTariff: readCheckbox(formData, "enableDroneTariff"),
      enableRonin4dTariff: readCheckbox(formData, "enableRonin4dTariff"),
      enableKilometers: readCheckbox(formData, "enableKilometers"),
      kilometers: readNumber(formData, "kilometers"),
      enableParkingCosts: readCheckbox(formData, "enableParkingCosts"),
      parkingCosts: readNumber(formData, "parkingCosts"),
      customEquipment: getSelectedCustomEquipment()
    },
    result: endTime && latestResult && !calculationIsStale ? {
      totalHours: latestResult.totalHours,
      overtimeHours: latestResult.overtimeHours,
      nightHours: latestResult.nightHours,
      subtotalExVat: latestResult.subtotalExVat
    } : null
  };
}

function clearCalculationDisplay() {
  [
    "totalHours", "overtimeHours", "overtime10To12Hours", "overtimeFrom12Hours",
    "overtimeFrom14Hours", "nightHours", "nightOvertimeHours", "pureNightHours"
  ].forEach((name) => setResult(name, 0));
  [
    "baseAmount", "overtimeAmount", "nightAmount", "droneTariffAmount",
    "ronin4dTariffAmount", "kilometerAmount", "parkingAmount", "subtotalExVat",
    "vatAmount", "totalIncVat"
  ].forEach((name) => setResult(name, 0, formatEuro));
  renderCustomEquipmentResults([]);
  form.dataset.summary = "";
  latestResult = null;
  calculationIsStale = false;
  calculationStatus.hidden = true;
  nextDayNotice.hidden = true;
}

function applyWorkdaySnapshot(workday) {
  const snapshot = workday?.calculationData || {};
  if (!snapshot.date) return;

  currentWorkdayId = workday.id;
  form.elements.namedItem("date").value = snapshot.date;
  form.elements.namedItem("startTime").value = snapshot.startTime || "08:00";
  form.elements.namedItem("endTime").value = snapshot.endTime || "";
  if (snapshot.settings) populateSettings({ ...getSettingsFromForm(), ...snapshot.settings });
  const department = form.querySelector(`input[name="department"][value="${snapshot.department || "camera"}"]`);
  if (department && !department.disabled) department.checked = true;
  form.elements.namedItem("breakMinutes").value = String(snapshot.breakMinutes || 0);

  const extras = snapshot.extras || {};
  [
    "enableDroneTariff", "enableRonin4dTariff", "enableKilometers", "enableParkingCosts"
  ].forEach((name) => {
    const field = form.elements.namedItem(name);
    if (field && !field.disabled) field.checked = Boolean(extras[name]);
  });
  form.elements.namedItem("kilometers").value = String(extras.kilometers || 0);
  form.elements.namedItem("parkingCosts").value = String(extras.parkingCosts || 0);
  (extras.customEquipment || []).forEach((item) => {
    const field = customEquipmentOptions.querySelector(`[data-custom-equipment-id="${item.id}"]`);
    if (field) field.checked = Boolean(item.enabled);
  });

  updateDepartmentVisibility();
  updateKilometerVisibility();
  updateParkingVisibility();
  updateNightSettingsVisibility();
  updateRateSettingsVisibility();
  updatePauseVisibility();
  updateWorkdaySaveAccess();
  const url = new URL(location.href);
  url.searchParams.set("workday", workday.id);
  history.replaceState({}, "", url);
  if (snapshot.endTime) updateCalculation();
  else clearCalculationDisplay();
  sessionUi?.showToast("Werkdag geopend.");
}

async function persistWorkday(snapshot, id = null) {
  const saved = await workdayService.save(currentAccountUser.id, {
    id,
    workDate: snapshot.date,
    calculationData: snapshot
  }, { mock: currentUserContext?.subscription?.isMock });
  currentWorkdayId = saved.id;
  updateWorkdaySaveAccess();
  const url = new URL(location.href);
  url.searchParams.set("workday", saved.id);
  history.replaceState({}, "", url);
  sessionUi?.showToast("Werkdag opgeslagen.");
  return saved;
}

async function saveWorkday({ allowDuplicate = false } = {}) {
  const date = form.elements.namedItem("date").value;
  if (!date) return;
  if (!currentUserContext?.isPro) {
    sessionUi?.openUpgrade();
    return;
  }

  workdaySaveButton.disabled = true;
  try {
    const snapshot = buildWorkdaySnapshot();
    if (currentWorkdayId) {
      await persistWorkday(snapshot, currentWorkdayId);
      return;
    }
    if (!allowDuplicate) {
      const existing = await workdayService.listByDate(
        currentAccountUser.id,
        date,
        { mock: currentUserContext.subscription.isMock }
      );
      if (existing.length) {
        pendingDuplicateWorkday = { snapshot, existing: existing[0] };
        openNativeDialog(duplicateWorkdayDialog);
        return;
      }
    }
    await persistWorkday(snapshot);
  } catch (error) {
    console.warn("Werkdag opslaan is mislukt.", error);
    sessionUi?.showToast(error.message || "Werkdag opslaan is niet gelukt.");
  } finally {
    updateWorkdaySaveAccess();
  }
}

function updateWorkdaySaveAccess() {
  if (!workdaySaveButton) return;
  const hasDate = Boolean(form.elements.namedItem("date").value);
  const isPro = Boolean(currentUserContext?.isPro);
  const isToday = form.elements.namedItem("date").value === localDateValue();
  workdaySaveButton.disabled = !hasDate;
  workdaySaveButton.classList.toggle("is-pro-locked", !isPro);
  if (workdaySaveLabel) {
    workdaySaveLabel.textContent = currentWorkdayId
      ? "Werkdag bijwerken"
      : (!isPro && isToday ? "Werkdag van vandaag opslaan" : "Werkdag opslaan");
  }
  if (workdaySaveHint) workdaySaveHint.hidden = isPro;
  if (workdaySaveBadge) workdaySaveBadge.hidden = isPro;
  workdaySaveButton.title = hasDate
    ? (isPro ? "Werkdag opslaan" : "Werkdagen zijn beschikbaar met Pro")
    : "Vul eerst een datum in";
}

async function initializeWorkdayContext() {
  if (!currentAccountUser || !currentUserContext?.isPro || workdayContextInitializedFor === currentAccountUser.id) {
    return;
  }
  workdayContextInitializedFor = currentAccountUser.id;
  const requestedId = new URLSearchParams(location.search).get("workday");
  try {
    if (requestedId) {
      const requested = await workdayService.get(
        currentAccountUser.id,
        requestedId,
        { mock: currentUserContext.subscription.isMock }
      );
      if (requested) applyWorkdaySnapshot(requested);
      else sessionUi?.showToast("Deze werkdag kon niet worden gevonden.");
      return;
    }

    const promptKey = `overuurtjeTodayWorkdayPrompt:${localDateValue()}`;
    if (sessionStorage.getItem(promptKey)) return;
    sessionStorage.setItem(promptKey, "shown");
    const existing = await workdayService.listByDate(
      currentAccountUser.id,
      localDateValue(),
      { mock: currentUserContext.subscription.isMock }
    );
    if (existing.length) {
      todayWorkday = existing[0];
      openNativeDialog(todayWorkdayDialog);
    }
  } catch (error) {
    console.warn("Opgeslagen werkdagen konden niet worden gecontroleerd.", error);
  }
}

function getSelectedCustomEquipment() {
  return customEquipment.map((item) => ({
    id: item.id,
    name: item.name,
    amount: item.amount,
    enabled: Boolean(customEquipmentOptions.querySelector(`[data-custom-equipment-id="${item.id}"]`)?.checked)
  }));
}

function renderCustomEquipmentResults(items) {
  customEquipmentResults.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");
    label.textContent = item.name;
    value.textContent = formatEuro(item.amount);
    row.append(label, value);
    return row;
  }));
}

async function syncAccountSettings({ showStatus = false } = {}) {
  if (!currentAccountUser) return null;
  if (showStatus) settingsStatus.textContent = "Opslaan en synchroniseren…";

  try {
    const saved = await accountSettingsService.save(currentAccountUser.id, getAccountSettingsSnapshot());
    currentAccountSettings = saved;
    if (showStatus) settingsStatus.textContent = "Instellingen opgeslagen en gesynchroniseerd.";
    return saved;
  } catch (error) {
    if (showStatus) settingsStatus.textContent = "Lokaal opgeslagen; cloudsync is niet gelukt.";
    console.warn("Accountinstellingen konden niet worden gesynchroniseerd.", error);
    return null;
  }
}

function scheduleAccountSettingsSync() {
  if (!currentAccountUser) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => syncAccountSettings(), 900);
}

function updateSettingsScope() {
  const hasAccount = Boolean(currentAccountUser);
  details.hidden = hasAccount;
  accountSettingsEntry.hidden = !hasAccount;
  if (hasAccount) details.open = false;
  updateRateSettingsVisibility();
}

function updateProjectCreateAccess(isPro) {
  if (!projectCreateLink) return;
  projectCreateLink.hidden = false;
  projectCreateLink.classList.toggle("is-pro-locked", !isPro);
  projectCreateLink.setAttribute("aria-label", isPro ? "Project aanmaken" : "Project aanmaken is beschikbaar met Pro");
  const badge = projectCreateLink.querySelector(".project-pro-badge");
  if (badge) badge.hidden = isPro;
}

async function hydrateAccountSettings(context) {
  currentUserContext = context;
  currentAccountUser = context.auth.user;
  const pdfProBadge = pdfButton?.querySelector("[data-pro-badge]");
  if (pdfProBadge) pdfProBadge.hidden = context.isPro;
  updateSettingsScope();
  updateProjectCreateAccess(context.isPro);
  if (!currentAccountUser) {
    hydratedAccountUserId = null;
    currentAccountSettings = null;
    accountEquipmentVisibility = null;
    updateProjectCreateAccess(false);
    equipmentTariffs = {
      drone: DEFAULT_SETTINGS.droneTariffAmount,
      ronin: DEFAULT_SETTINGS.ronin4dTariffAmount
    };
    renderCustomEquipment([]);
    currentWorkdayId = null;
    workdayContextInitializedFor = null;
    populateSettings(getSavedSettings());
    departmentSwitch.classList.remove("is-account-locked");
    departmentSwitch.removeAttribute("aria-disabled");
    departmentSwitch.querySelectorAll(".department-choice").forEach((choice) => {
      choice.hidden = false;
      choice.querySelector("input").disabled = false;
    });
    updateDepartmentVisibility();
    updatePauseVisibility();
    updateWorkdaySaveAccess();
    return;
  }
  if (hydratedAccountUserId === currentAccountUser.id) return;
  hydratedAccountUserId = currentAccountUser.id;

  try {
    const [saved, equipment] = await Promise.all([
      accountSettingsService.load(currentAccountUser.id),
      context.isPro ? equipmentService.list(currentAccountUser.id) : Promise.resolve([])
    ]);
    if (saved) {
      applyAccountSettings(saved, context.isPro);
    } else {
      applyAccountSettings(await syncAccountSettings() || accountSettingsService.defaults, context.isPro);
    }
    renderCustomEquipment(context.isPro ? equipment : []);
    updateCalculation();
    await initializeWorkdayContext();
  } catch (error) {
    console.warn("Accountinstellingen konden niet worden geladen.", error);
    applyAccountSettings(accountSettingsService.defaults, context.isPro);
    renderCustomEquipment([]);
    await initializeWorkdayContext();
  }
  updateWorkdaySaveAccess();
}

function formatHours(value) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${numberFormatter.format(value)} uur`;
}

function formatEuro(value) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return euroFormatter.format(value);
}

function setResult(name, value, formatter = formatHours) {
  const el = document.querySelector(`[data-result="${name}"]`);
  if (el) el.textContent = formatter(value);
}

function setPrintValue(name, value) {
  const el = document.querySelector(`[data-print="${name}"]`);
  if (el) el.textContent = value;
}

function formatCalculation(hours, hourlyRate, factor) {
  return `${numberFormatter.format(hours)} uur × ${euroFormatter.format(hourlyRate)} × ${numberFormatter.format(factor * 100)}%`;
}

function addPrintCalculationLine(container, label, calculation, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;

  const row = document.createElement("div");
  const description = document.createElement("div");
  const title = document.createElement("strong");
  const formula = document.createElement("span");
  const value = document.createElement("strong");

  title.textContent = label;
  formula.textContent = calculation;
  value.textContent = euroFormatter.format(amount);
  description.append(title, formula);
  row.append(description, value);
  container.append(row);
}

function renderPrintBreakdown(result) {
  if (!result) return;

  const date = form.elements.namedItem("date").value;
  const startTime = form.elements.namedItem("startTime").value;
  const endTime = form.elements.namedItem("endTime").value;
  const lines = document.querySelector("#print-calculation-lines");
  const usesHalfDayRate = result.baseAmount < result.settings.dayRate;

  setPrintValue("date", date || "Niet ingevuld");
  setPrintValue("times", `${startTime} tot ${endTime}${result.endsNextDay ? " (volgende dag)" : ""}`);
  setPrintValue("breakMinutes", result.breakMinutes ? `${result.breakMinutes} minuten` : "-");
  document.querySelector('[data-print-row="break"]').hidden = !result.breakMinutes;
  setPrintValue("totalHours", formatHours(result.totalHours));
  setPrintValue("subtotalExVat", euroFormatter.format(result.subtotalExVat));
  setPrintValue("vatAmount", euroFormatter.format(result.vatAmount));
  setPrintValue("totalIncVat", euroFormatter.format(result.totalIncVat));

  lines.replaceChildren();
  addPrintCalculationLine(lines,
    result.rateMode === "hour" ? "Gewerkte uren" : (usesHalfDayRate ? "Halve dagvergoeding" : "Minimale dagvergoeding"),
    result.rateMode === "hour"
      ? `${numberFormatter.format(Math.min(result.totalHours, result.settings.normalDayHours))} uur × ${euroFormatter.format(result.hourlyRate)}`
      : (usesHalfDayRate ? `75% van ${euroFormatter.format(result.settings.dayRate)}` : `Dagtarief voor maximaal ${numberFormatter.format(result.settings.normalDayHours)} uur`),
    result.baseAmount
  );
  addPrintCalculationLine(
    lines,
    "Overuren tegen 100%",
    formatCalculation(result.standardOvertimeHours, result.hourlyRate, 1),
    result.standardOvertimeAmount
  );
  addPrintCalculationLine(
    lines,
    "Overuren tegen 150%",
    formatCalculation(result.overtime10To12Hours, result.hourlyRate, 1.5),
    result.overtime10To12Amount
  );
  addPrintCalculationLine(
    lines,
    "Overuren tegen 200%",
    formatCalculation(result.overtimeFrom12Hours, result.hourlyRate, 2),
    result.overtimeFrom12Amount
  );
  addPrintCalculationLine(
    lines,
    "Overuren tegen 250%",
    formatCalculation(result.overtimeFrom14Hours, result.hourlyRate, 2.5),
    result.overtimeFrom14Amount
  );
  addPrintCalculationLine(
    lines,
    "Pure nachturen (100% toeslag)",
    `${formatCalculation(result.pureNightHours, result.hourlyRate, 1)} (uur is inclusief dagtarief 200% waard)`,
    result.pureNightAmount
  );
  result.nightOvertimeSurchargeBreakdown.forEach((item) => {
    addPrintCalculationLine(
      lines,
      `Nachttoeslag over overuren tegen ${numberFormatter.format(item.surchargeFactor * 100)}%`,
      `${formatCalculation(item.hours, result.hourlyRate, item.surchargeFactor)} (overuurvergoeding staat hierboven)`,
      item.amount
    );
  });
  addPrintCalculationLine(lines, "Drone tarief", "Vaste toeslag", result.droneTariffAmount);
  addPrintCalculationLine(lines, "Ronin 4D tarief", "Vaste toeslag", result.ronin4dTariffAmount);
  result.customEquipmentItems.forEach((item) => {
    addPrintCalculationLine(lines, item.name, "Vaste apparatuurtoeslag", item.amount);
  });
  addPrintCalculationLine(
    lines,
    "Kilometervergoeding",
    `${numberFormatter.format(result.kilometers)} km × ${euroFormatter.format(result.settings.kilometerRate)}`,
    result.kilometerAmount
  );
  addPrintCalculationLine(lines, "Parkeer/onkosten", "Ingevoerde onkosten", result.parkingAmount);
}

function buildSummary(result) {
  const date = form.elements.namedItem("date").value;
  const startTime = form.elements.namedItem("startTime").value;
  const endTime = form.elements.namedItem("endTime").value;
  const lines = [];

  if (date) {
    lines.push(`Datum: ${date}`);
  }

  lines.push(`Tijden: ${startTime} tot ${endTime}${result.endsNextDay ? " (volgende dag)" : ""}`);
  lines.push(`Totaal gewerkt: ${formatHours(result.totalHours)}`);

  if (result.overtimeHours > 0) {
    lines.push(`Overuren: ${formatHours(result.overtimeHours)}`);
  }

  if (result.nightHours > 0) {
    lines.push(`Nachturen: ${formatHours(result.nightHours)}`);
  }

  if (result.droneTariffAmount > 0) {
    lines.push(`Drone tarief: ${euroFormatter.format(result.droneTariffAmount)}`);
  }

  if (result.ronin4dTariffAmount > 0) {
    lines.push(`Ronin 4D tarief: ${euroFormatter.format(result.ronin4dTariffAmount)}`);
  }

  result.customEquipmentItems.forEach((item) => {
    lines.push(`${item.name}: ${euroFormatter.format(item.amount)}`);
  });

  if (result.kilometerAmount > 0) {
    lines.push(`Kilometers: ${numberFormatter.format(result.kilometers)} km × ${euroFormatter.format(result.settings.kilometerRate)} = ${euroFormatter.format(result.kilometerAmount)}`);
  }

  if (result.parkingAmount > 0) {
    lines.push(`Parkeer/onkosten: ${euroFormatter.format(result.parkingAmount)}`);
  }

  lines.push(`Exclusief btw: ${euroFormatter.format(result.subtotalExVat)}`);

  return lines.join("\n");
}

function updateCalculation(trackCompletion = false) {
  if (!form.reportValidity() || !settingsForm.reportValidity()) return;
  if (!form.elements.namedItem("endTime").value) {
    clearCalculationDisplay();
    if (trackCompletion) sessionUi?.showToast("Vul eerst de eindtijd in om te berekenen.");
    return;
  }

  const settings = getSettingsFromForm();
  const formData = new FormData(form);
  const department = formData.get("department");

  const result = calculateTariff(
    {
      startTime: form.elements.namedItem("startTime").value,
      endTime: form.elements.namedItem("endTime").value,
      breakMinutes: settings.breakMinutes,
      rateMode: settings.rateMode,
      hourlyRate: settings.hourlyRate,
      enableDroneTariff: readCheckbox(formData, "enableDroneTariff"),
      enableRonin4dTariff: department === "camera" && readCheckbox(formData, "enableRonin4dTariff"),
      customEquipment: getSelectedCustomEquipment(),
      enableKilometers: readCheckbox(formData, "enableKilometers"),
      kilometers: readNumber(formData, "kilometers"),
      enableParkingCosts: readCheckbox(formData, "enableParkingCosts"),
      parkingCosts: readNumber(formData, "parkingCosts")
    },
    settings
  );

  setResult("totalHours", result.totalHours);
  setResult("overtimeHours", result.overtimeHours);
  setResult("overtime10To12Hours", result.overtime10To12Hours);
  setResult("overtimeFrom12Hours", result.overtimeFrom12Hours);
  setResult("overtimeFrom14Hours", result.overtimeFrom14Hours);
  setResult("nightHours", result.nightHours);
  setResult("nightOvertimeHours", result.nightOvertimeHours);
  setResult("pureNightHours", result.pureNightHours);
  setResult("baseAmount", result.baseAmount, formatEuro);
  setResult("overtimeAmount", result.overtimeAmount, formatEuro);
  setResult("nightAmount", result.nightAmount, formatEuro);
  setResult("droneTariffAmount", result.droneTariffAmount, formatEuro);
  setResult("ronin4dTariffAmount", result.ronin4dTariffAmount, formatEuro);
  renderCustomEquipmentResults(result.customEquipmentItems);
  setResult("kilometerAmount", result.kilometerAmount, formatEuro);
  setResult("parkingAmount", result.parkingAmount, formatEuro);
  setResult("subtotalExVat", result.subtotalExVat, formatEuro);
  setResult("vatAmount", result.vatAmount, formatEuro);
  setResult("totalIncVat", result.totalIncVat, formatEuro);

  nextDayNotice.hidden = !result.endsNextDay;
  form.dataset.summary = buildSummary(result);
  latestResult = result;
  renderPrintBreakdown(result);
  calculationIsStale = false;
  calculationStatus.hidden = true;

  if (trackCompletion) {
    analytics?.track("calculation_completed", {
      department,
      total_hours: Number(result.totalHours.toFixed(2)),
      overtime_hours: Number(result.overtimeHours.toFixed(2)),
      night_hours: Number(result.nightHours.toFixed(2)),
      drone: readCheckbox(formData, "enableDroneTariff"),
      ronin: department === "camera" && readCheckbox(formData, "enableRonin4dTariff"),
      mileage: readCheckbox(formData, "enableKilometers"),
      parking: readCheckbox(formData, "enableParkingCosts")
    });
  }
}

function saveCurrentSettings() {
  if (!settingsForm.reportValidity()) {
    sessionUi?.showToast("Controleer de gemarkeerde instellingen.");
    return;
  }

  saveSettings(getSettingsFromForm());
  details.open = false;
  settingsStatus.textContent = "";

  if (!currentAccountUser) {
    sessionUi?.showToast("Instellingen lokaal opgeslagen.");
    return;
  }

  clearTimeout(cloudSyncTimer);
  void syncAccountSettings().then((saved) => {
    sessionUi?.showToast(saved
      ? "Instellingen opgeslagen en gesynchroniseerd."
      : "Lokaal opgeslagen; cloudsync is niet gelukt.");
  });
}

function updateNightSettingsVisibility() {
  const nightEnabled = settingsForm.elements.namedItem("enableNightTariff").checked;
  document.querySelector("#night-time-settings").hidden = !nightEnabled;
}

function updateRateSettingsVisibility() {
  const rateMode = settingsForm.elements.namedItem("rateMode").value;
  const hasAccount = Boolean(currentAccountUser);
  settingsForm.querySelector('[data-local-rate="day"]').hidden = hasAccount || rateMode === "hour";
  settingsForm.querySelector('[data-local-rate="hour"]').hidden = hasAccount || rateMode !== "hour";
}

function updatePauseVisibility() {
  const enabled = settingsForm.elements.namedItem("enableBreak").checked;
  planningBreakField.hidden = !enabled;
  planningGrid.classList.toggle("has-break", enabled);
  if (!enabled) form.elements.namedItem("breakMinutes").value = "0";
}

function updateKilometerVisibility() {
  const kilometersEnabled = form.elements.namedItem("enableKilometers").checked;
  kilometerInput.hidden = !kilometersEnabled;
}

function updateParkingVisibility() {
  const parkingEnabled = form.elements.namedItem("enableParkingCosts").checked;
  parkingInput.hidden = !parkingEnabled;
}

function updateDepartmentVisibility() {
  const department = form.elements.namedItem("department").value || "camera";
  const isPro = Boolean(currentUserContext?.isPro);
  const showDrone = isPro ? Boolean(accountEquipmentVisibility?.drone) : true;
  const showRonin = department === "camera" && (isPro ? Boolean(accountEquipmentVisibility?.ronin) : true);
  const droneCheckbox = form.elements.namedItem("enableDroneTariff");
  const roninCheckbox = form.elements.namedItem("enableRonin4dTariff");

  inputOptions.dataset.department = department;
  droneOption.hidden = !showDrone;
  droneResultRow.hidden = !showDrone;
  roninOption.hidden = !showRonin;
  roninResultRow.hidden = !showRonin;
  [droneOption, roninOption].forEach((option) => option.classList.toggle("is-pro-locked", !isPro));
  [droneOption, roninOption].forEach((option) => {
    if (!isPro) {
      option.setAttribute("role", "button");
      option.setAttribute("tabindex", "0");
      option.setAttribute("aria-label", `${option.querySelector(".checkbox-label span").textContent} is beschikbaar met Pro`);
    } else {
      option.removeAttribute("role");
      option.removeAttribute("tabindex");
      option.removeAttribute("aria-label");
    }
  });
  [droneCheckbox, roninCheckbox].forEach((checkbox) => { checkbox.disabled = !isPro; });
  document.querySelectorAll(".pro-option-badge").forEach((badge) => { badge.hidden = isPro; });
  if (!isPro) {
    droneCheckbox.checked = false;
    roninCheckbox.checked = false;
  }

  if (!showDrone) {
    droneCheckbox.checked = false;
    setResult("droneTariffAmount", 0, formatEuro);
  }

  if (!showRonin) {
    roninCheckbox.checked = false;
    setResult("ronin4dTariffAmount", 0, formatEuro);
  }
}

function markCalculationStale() {
  if (!form.dataset.summary) return;
  calculationIsStale = true;
  calculationStatus.hidden = false;
}

async function copySummary() {
  if (calculationIsStale) {
    copyStatus.textContent = "Bereken eerst opnieuw.";
    setTimeout(() => {
      copyStatus.textContent = "";
    }, 2000);
    return;
  }

  const summary = form.dataset.summary || "";

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(summary);
    } else {
      copyWithTextarea(summary);
    }

    copyStatus.textContent = "Gekopieerd";
  } catch {
    try {
      copyWithTextarea(summary);
      copyStatus.textContent = "Gekopieerd";
    } catch {
      copyStatus.textContent = "Kopiëren is niet toegestaan door de browser.";
    }
  }

  setTimeout(() => {
    copyStatus.textContent = "";
  }, 2000);
}

function copyWithTextarea(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Kopiëren mislukt.");
  }
}

function showSiteToast(message) {
  if (analytics?.showToast) {
    analytics.showToast(message);
    return;
  }

  const toast = document.querySelector("#site-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("visible");
}

async function copyShareUrl() {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(SHARE_URL);
  } else {
    copyWithTextarea(SHARE_URL);
  }
}

async function shareSite() {
  const supportsNativeShare = typeof navigator.share === "function";
  analytics?.track("share_clicked", {
    method: supportsNativeShare ? "web_share" : "clipboard",
    content_type: "website"
  });

  if (supportsNativeShare) {
    try {
      await navigator.share({
        title: "Overuurtje.nl",
        text: SHARE_TEXT,
        url: SHARE_URL
      });
      showSiteToast("Link gedeeld!");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    await copyShareUrl();
    showSiteToast("Link gekopieerd naar klembord!");
  } catch {
    showSiteToast("Link kopiëren is niet toegestaan door de browser.");
  }
}

function trackOptionChange(target) {
  if (!(target instanceof HTMLInputElement)) return;

  const department = form.elements.namedItem("department").value || "camera";
  if (target.name === "department" && target.checked) {
    analytics?.track("department_selected", { department: target.value });
    return;
  }

  if (!target.checked) return;

  const eventByField = {
    enableDroneTariff: "drone_enabled",
    enableRonin4dTariff: "ronin4d_enabled",
    enableKilometers: "mileage_enabled",
    enableParkingCosts: "parking_enabled"
  };
  const eventName = eventByField[target.name];
  if (eventName) analytics?.track(eventName, { department });
}

function getTimeParts(value) {
  const [hour = "00", minute = "00"] = String(value).split(":");
  return {
    hour: HOURS.includes(hour) ? hour : "00",
    minute: QUARTER_HOURS.includes(minute) ? minute : "00"
  };
}

function setTimeValue(field, hour, minute) {
  field.value = `${hour}:${minute}`;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function closeTimePickers(exceptPicker) {
  document.querySelectorAll(".time-picker").forEach((picker) => {
    if (picker !== exceptPicker) picker.hidden = true;
  });
}

function renderTimePicker(field, picker) {
  const { hour: selectedHour, minute: selectedMinute } = getTimeParts(field.value);
  const hourColumn = picker.querySelector("[data-time-column='hours']");
  const minuteColumn = picker.querySelector("[data-time-column='minutes']");

  hourColumn.replaceChildren(
    ...HOURS.map((hour) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = hour;
      button.dataset.timePart = "hour";
      button.dataset.timeValue = hour;
      button.className = hour === selectedHour ? "active" : "";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setTimeValue(field, hour, getTimeParts(field.value).minute);
        renderTimePicker(field, picker);
      });
      return button;
    })
  );

  minuteColumn.replaceChildren(
    ...QUARTER_HOURS.map((minute) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = minute;
      button.dataset.timePart = "minute";
      button.dataset.timeValue = minute;
      button.className = minute === selectedMinute ? "active" : "";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setTimeValue(field, getTimeParts(field.value).hour, minute);
        picker.hidden = true;
      });
      return button;
    })
  );
}

function setupTimePicker(field) {
  const control = field.closest(".time-control");
  const trigger = control.querySelector(".time-picker-trigger");
  const picker = document.createElement("div");
  picker.className = "time-picker";
  picker.hidden = true;
  picker.innerHTML = `
    <div class="time-picker-column" data-time-column="hours" aria-label="Uren"></div>
    <div class="time-picker-column" data-time-column="minutes" aria-label="Minuten"></div>
  `;
  control.append(picker);

  picker.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  picker.addEventListener("touchstart", (event) => {
    event.stopPropagation();
  }, { passive: true });

  const openPicker = (event) => {
    event.stopPropagation();
    event.preventDefault();
    renderTimePicker(field, picker);
    closeTimePickers(picker);
    picker.hidden = false;
  };

  field.addEventListener("click", openPicker);
  trigger.addEventListener("click", openPicker);
  field.addEventListener("touchend", openPicker);
  trigger.addEventListener("touchend", openPicker);
}

populateSettings(getSavedSettings());
if (!form.elements.namedItem("date").value) {
  form.elements.namedItem("date").value = localDateValue();
}
updateDepartmentVisibility();
updateCalculation();
updateNightSettingsVisibility();
updateRateSettingsVisibility();
updatePauseVisibility();
updateKilometerVisibility();
updateParkingVisibility();

document.querySelectorAll("[data-time-picker]").forEach(setupTimePicker);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".time-control")) closeTimePickers();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTimePickers();
});

form.addEventListener("input", markCalculationStale);
form.addEventListener("click", (event) => {
  if (currentUserContext?.isPro) return;
  if (event.target.closest("#drone-option, #ronin-option")) {
    event.preventDefault();
    sessionUi?.openUpgrade();
  }
});
form.addEventListener("keydown", (event) => {
  if (currentUserContext?.isPro || !["Enter", " "].includes(event.key)) return;
  if (event.target.closest("#drone-option, #ronin-option")) {
    event.preventDefault();
    sessionUi?.openUpgrade();
  }
});
projectCreateLink?.addEventListener("click", (event) => {
  if (currentUserContext?.isPro) return;
  event.preventDefault();
  sessionUi?.openUpgrade();
});
form.addEventListener("change", (event) => {
  trackOptionChange(event.target);
  updateDepartmentVisibility();
  updateKilometerVisibility();
  updateParkingVisibility();
  markCalculationStale();
  if (["department", "enableDroneTariff", "enableRonin4dTariff"].includes(event.target.name)) {
    scheduleAccountSettingsSync();
  }
  if (event.target.name === "date") updateWorkdaySaveAccess();
});
settingsForm.addEventListener("input", (event) => {
  markCalculationStale();
  if (["dayRate", "hourlyRate", "normalDayHours", "kilometerRate"].includes(event.target.name)) scheduleAccountSettingsSync();
});
settingsForm.addEventListener("change", () => {
  updateNightSettingsVisibility();
  updateRateSettingsVisibility();
  updatePauseVisibility();
  markCalculationStale();
  scheduleAccountSettingsSync();
});
recalculateButton.addEventListener("click", () => updateCalculation(true));
workdaySaveButton?.addEventListener("click", () => saveWorkday());
clearEndTimeButton?.addEventListener("click", () => {
  form.elements.namedItem("endTime").value = "";
  clearCalculationDisplay();
  markCalculationStale();
});
document.querySelector("#open-existing-workday")?.addEventListener("click", () => {
  if (pendingDuplicateWorkday?.existing) applyWorkdaySnapshot(pendingDuplicateWorkday.existing);
  pendingDuplicateWorkday = null;
  closeNativeDialog(duplicateWorkdayDialog);
});
document.querySelector("#create-duplicate-workday")?.addEventListener("click", async () => {
  const snapshot = pendingDuplicateWorkday?.snapshot;
  pendingDuplicateWorkday = null;
  closeNativeDialog(duplicateWorkdayDialog);
  if (!snapshot) return;
  try {
    await persistWorkday(snapshot);
  } catch (error) {
    sessionUi?.showToast(error.message || "Werkdag opslaan is niet gelukt.");
  } finally {
    updateWorkdaySaveAccess();
  }
});
document.querySelector("#continue-today-workday")?.addEventListener("click", () => {
  if (todayWorkday) applyWorkdaySnapshot(todayWorkday);
  todayWorkday = null;
  closeNativeDialog(todayWorkdayDialog);
});
document.querySelector("#new-today-calculation")?.addEventListener("click", () => {
  todayWorkday = null;
  closeNativeDialog(todayWorkdayDialog);
});
document.querySelectorAll("[data-workday-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => closeNativeDialog(button.closest("dialog")));
});
copyButton.addEventListener("click", copySummary);
saveSettingsButton.addEventListener("click", saveCurrentSettings);
pdfButton.addEventListener("click", () => {
  globalThis.OveruurtjeFeatureGate.require("pdf_export", currentUserContext, () => window.print());
});
shareButton.addEventListener("click", shareSite);

window.addEventListener("beforeprint", () => {
  renderPrintBreakdown(latestResult);
  closeTimePickers();
});

details.addEventListener("toggle", (event) => {
  localStorage.setItem("cameraTariefSettingsOpen", String(details.open));
  if (details.open && event.isTrusted) {
    analytics?.track("settings_opened");
  }
});
details.open = localStorage.getItem("cameraTariefSettingsOpen") === "true";
updateWorkdaySaveAccess();

document.addEventListener("overuurtje:user-context", (event) => hydrateAccountSettings(event.detail));
sessionUi?.ready.then(hydrateAccountSettings);
