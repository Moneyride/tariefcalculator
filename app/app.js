const { DEFAULT_SETTINGS, calculateTariff } = globalThis.TariffCalculator;

const SETTINGS_KEY = "cameraTariefCalculatorSettings";

const form = document.querySelector("#calculator-form");
const settingsForm = document.querySelector("#settings-form");
const nextDayNotice = document.querySelector("#next-day-notice");
const calculationStatus = document.querySelector("#calculation-status");
const recalculateButton = document.querySelector("#recalculate");
const copyButton = document.querySelector("#copy-summary");
const moneybirdExportButton = document.querySelector("#moneybird-export");
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
const optionsToggle = document.querySelector("#toggle-extras");
const departmentSwitch = document.querySelector(".department-switch");
const activeFunctionName = document.querySelector("#active-function-name");
const projectCreateLink = document.querySelector("#project-create-link");
const workdaySaveButton = document.querySelector("#save-workday");
const workdaySaveLabel = workdaySaveButton?.querySelector("[data-workday-save-label]");
const workdaySaveHint = workdaySaveButton?.querySelector("[data-workday-save-hint]");
const workdaySaveBadge = workdaySaveButton?.querySelector("[data-workday-save-badge]");
const shareFromParticipantsButton = document.querySelector("#share-from-participants");
const workdayNameField = document.querySelector("#workday-name-field");
const workdayNameSuggestions = document.querySelector("#workday-name-suggestions");
const clientNameSuggestions = document.querySelector("#client-name-suggestions");
const currentWorkdayParticipants = document.querySelector("#current-workday-participants");
const currentWorkdayParticipantList = document.querySelector("#current-workday-participant-list");
const sharedReceiverContext = document.querySelector("#shared-receiver-context");
const sharedReceiverTitle = document.querySelector("#shared-receiver-title");
const resumeSharedWorkdayButton = document.querySelector("#resume-shared-workday");
const sharedStartTimeLockButton = document.querySelector("#lock-shared-start-time");
const sharedEndTimeLockButton = document.querySelector("#lock-shared-end-time");
const projectDayContextPanel = document.querySelector("#project-day-context");
const projectDayContextName = document.querySelector("#project-day-context-name");
const projectDayContextDate = document.querySelector("#project-day-context-date");
const projectDayContextLink = document.querySelector("#project-day-context-link");
const liveWorkdayStatus = document.querySelector("#live-workday-status");
const liveWorkdayDuration = document.querySelector("#live-workday-duration");
const liveEndTimecode = document.querySelector("#live-end-timecode");
const resumeLiveWorkdayButton = document.querySelector("#resume-live-workday");
const enableWorkdayNotifications = document.querySelector("#enable-workday-notifications");
const duplicateWorkdayDialog = document.querySelector("#duplicate-workday-dialog");
const todayWorkdayDialog = document.querySelector("#today-workday-dialog");
const unfinishedSharedWorkdayDialog = document.querySelector("#unfinished-shared-workday-dialog");
const confirmSharedCalculationButton = document.querySelector("#confirm-shared-calculation");
const activeSharedReminder = document.querySelector("#active-shared-reminder");
const activeSharedReminderCopy = document.querySelector("#active-shared-reminder-copy");
const openActiveSharedButton = document.querySelector("#open-active-shared");
const sharedCompletionDialog = document.querySelector("#shared-completion-dialog");
const sharedCompletionCopy = document.querySelector("#shared-completion-copy");
const confirmSharedCompletionButton = document.querySelector("#confirm-shared-completion");
const sharedResumeDialog = document.querySelector("#shared-resume-dialog");
const confirmSharedResumeButton = document.querySelector("#confirm-shared-resume");
const droneOption = document.querySelector("#drone-option");
const roninOption = document.querySelector("#ronin-option");
const travelOption = document.querySelector("#travel-option");
const travelRegionInput = document.querySelector("#travel-region-input");
const travelResultRow = document.querySelector("[data-travel-result]");
const customEquipmentOptions = document.querySelector("#custom-equipment-options");
const customEquipmentResults = document.querySelector("#custom-equipment-results");
const droneResultRow = document.querySelector('[data-result="droneTariffAmount"]').closest("div");
const roninResultRow = document.querySelector('[data-result="ronin4dTariffAmount"]').closest("div");
const analytics = globalThis.OveruurtjeAnalytics;
const accountSettingsService = globalThis.OveruurtjeSettings;
const functionService = globalThis.OveruurtjeFunctions;
const equipmentService = globalThis.OveruurtjeEquipment;
const projectService = globalThis.OveruurtjeProjects;
const workdayService = globalThis.OveruurtjeWorkdays;
const freeActiveWorkdayService = globalThis.OveruurtjeFreeActiveWorkday;
const sessionUi = globalThis.OveruurtjeSessionUI;
const shareUi = globalThis.OveruurtjeShareUI;
const shareService = globalThis.OveruurtjeShares;
const badgeService = globalThis.OveruurtjeBadges;
const liveWorkday = globalThis.OveruurtjeLiveWorkday;
const workdayNotifications = globalThis.OveruurtjeWorkdayNotifications;
const accountingExport = globalThis.OveruurtjeAccountingExport;
const accountingUi = globalThis.OveruurtjeAccountingUi;
const accountingService = globalThis.OveruurtjeAccounting;
const participantDevToggle = document.querySelector("#participant-dev-toggle");

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
let accountingVisibilityRequest = 0;

function applyAccountingExportState(result) {
  if (!moneybirdExportButton) return;
  const state = accountingService?.exportConnectionState?.(result) || { ready: false };
  moneybirdExportButton.hidden = !(currentUserContext?.isPro && state.ready);
  if (!moneybirdExportButton.hidden) moneybirdExportButton.textContent = `Naar ${state.providerName}`;
}

async function updateAccountingExportVisibility(context) {
  if (!moneybirdExportButton) return;
  const request = ++accountingVisibilityRequest;
  moneybirdExportButton.hidden = true;
  if (!context?.auth?.user || !context?.isPro || !accountingService) return;
  try {
    const status = await accountingService.status();
    if (request !== accountingVisibilityRequest) return;
    applyAccountingExportState(status);
  } catch {
    if (request === accountingVisibilityRequest) moneybirdExportButton.hidden = true;
  }
}
let currentAccountUser = null;
let currentUserContext = null;
let currentAccountSettings = null;
let accountEquipmentVisibility = null;
let equipmentTariffs = {
  drone: DEFAULT_SETTINGS.droneTariffAmount,
  ronin: DEFAULT_SETTINGS.ronin4dTariffAmount
};
let customEquipment = [];
let workFunctions = [];
let activeWorkFunction = null;
let hydratedAccountUserId = null;
let cloudSyncTimer = null;
let functionSyncTimer = null;
let currentWorkdayId = null;
let currentShareWorkdayId = null;
let currentProjectDayContext = null;
let currentSharedSource = null;
let currentReceivedShareId = null;
let currentSharedOwnerName = "";
let currentSharedSourceEndTime = "";
let persistedWorkdayEndTime = "";
let sharedReceiverCalculatedEarly = false;
let sharedTimeOverrides = new Set();
let sharedParticipants = [];
let pendingDuplicateWorkday = null;
let todayWorkday = null;
let activeSharedWorkday = null;
let pendingSharedCompletionSave = null;
let workdayContextInitializedFor = null;
const PARTICIPANT_DEMO_KEY = "overuurtjeDevSharedCrew";

const participantDemoProfiles = [
  {
    userId: "demo-ivo",
    firstName: "Ivo",
    hasAccount: true,
    isOwner: false,
    isCurrentUser: false,
    selectedBadgeIcon: "🌙",
    selectedBadgeName: "Nachtraaf",
    crewCard: {
      displayName: "Ivo",
      memberSince: "2025-11-14",
      registeredWorkdays: 86,
      badgeCount: 12,
      crewCount: 19,
      jointWorkdays: 24,
      selectedBadge: { name: "Nachtraaf", icon: "🌙" },
      featuredBadges: [
        { name: "Nachtraaf", icon: "🌙" },
        { name: "Teamspeler", icon: "🤝" },
        { name: "First Call", icon: "⏰" }
      ]
    }
  },
  {
    userId: "demo-noor",
    firstName: "Noor",
    hasAccount: true,
    isOwner: false,
    isCurrentUser: false,
    selectedBadgeIcon: "🎥",
    selectedBadgeName: "Productieveteraan",
    crewCard: {
      displayName: "Noor",
      memberSince: "2026-02-03",
      registeredWorkdays: 121,
      badgeCount: 16,
      crewCount: 27,
      jointWorkdays: 8,
      selectedBadge: { name: "Productieveteraan", icon: "🎥" },
      featuredBadges: [
        { name: "Productieveteraan", icon: "🎥" },
        { name: "Road Warrior", icon: "🚗" },
        { name: "Drukke Maand", icon: "🔥" }
      ]
    }
  }
];

function canDemoParticipants() {
  return ["localhost", "127.0.0.1"].includes(location.hostname)
    || Boolean(globalThis.OveruurtjeConfig?.subscription?.allowMockSubscriptions);
}

function participantDemoEnabled() {
  return canDemoParticipants() && localStorage.getItem(PARTICIPANT_DEMO_KEY) === "1";
}

function announceBadgeAwards(awards) {
  if (!awards?.length) return;
  const labels = awards.map((badge) => `${badge.icon} ${badge.name}`);
  sessionUi?.showToast(`Badge${labels.length === 1 ? "" : "s"} behaald: ${labels.join(" · ")}`);
}

async function trackBadgeActivity(eventKey, sourceId = null, metadata = {}) {
  if (!currentAccountUser || !badgeService) return;
  try {
    await badgeService.track(eventKey, sourceId, metadata);
  } catch (error) {
    // Badges must never prevent a calculation, save, or PDF export.
    console.warn("Badgecontrole is niet gelukt.", error);
  } finally {
    // Database triggers can award a badge before record_badge_activity runs.
    // Refresh the notification inbox even when that RPC returns no new rows.
    document.dispatchEvent(new CustomEvent("overuurtje:badges-updated"));
  }
}

document.addEventListener("overuurtje:badges-earned", (event) => {
  announceBadgeAwards(event.detail?.awards || []);
});
let liveWorkdayController = null;
let workdayNotificationController = null;
let liveWorkdayArmed = false;
let sharedReceiverSyncTimer = null;
let knownWorkdayNames = [];

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

function nightSurchargeToTotalPercent(value) {
  return 100 + Math.max(0, Number(value) || 0);
}

function nightTotalToSurchargePercent(value) {
  return Math.max(0, (Number(value) || 100) - 100);
}

function updateGuestExplanationLink(settings) {
  const link = document.querySelector("#guest-settings-explanation");
  if (!link || !settings) return;
  const params = new URLSearchParams({
    source: "guest",
    dayRate: String(Number(settings.dayRate) || DEFAULT_SETTINGS.dayRate),
    normalDayHours: String(Number(settings.normalDayHours) || DEFAULT_SETTINGS.normalDayHours),
    nightTotalPercent: String(nightSurchargeToTotalPercent(settings.nightSurchargePercent)),
    travelWithinEuropePercent: String(Number(settings.travelWithinEuropePercent) || DEFAULT_SETTINGS.travelWithinEuropePercent),
    travelOutsideEuropePercent: String(Number(settings.travelOutsideEuropePercent) || DEFAULT_SETTINGS.travelOutsideEuropePercent)
  });
  link.href = `uitleg-werkregels.html?${params}`;
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
    minimumHours: readNumber(formData, "minimumHours"),
    vatPercent: DEFAULT_SETTINGS.vatPercent,
    enableHalfDayUnder6Hours: readCheckbox(formData, "enableHalfDayUnder6Hours"),
    enableOvertime10To12: readCheckbox(formData, "enableOvertime10To12"),
    enableOvertimeFrom12: readCheckbox(formData, "enableOvertimeFrom12"),
    enableOvertimeFrom14: readCheckbox(formData, "enableOvertimeFrom14"),
    enableNightTariff: readCheckbox(formData, "enableNightTariff"),
    nightSurchargePercent: nightTotalToSurchargePercent(readNumber(formData, "nightSurchargePercent")),
    nightStart: formData.get("nightStart"),
    nightEnd: formData.get("nightEnd"),
    nightRoundingMinutes: DEFAULT_SETTINGS.nightRoundingMinutes,
    droneTariffAmount: equipmentTariffs.drone,
    ronin4dTariffAmount: equipmentTariffs.ronin,
    kilometerRate: readNumber(formData, "kilometerRate"),
    travelWithinEuropePercent: currentAccountSettings?.travelWithinEuropePercent ?? DEFAULT_SETTINGS.travelWithinEuropePercent,
    travelOutsideEuropePercent: currentAccountSettings?.travelOutsideEuropePercent ?? DEFAULT_SETTINGS.travelOutsideEuropePercent
  };
}

function populateSettings(settings) {
  Object.entries(settings).forEach(([key, value]) => {
    const field = settingsForm.elements.namedItem(key);
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = key === "nightSurchargePercent" ? nightSurchargeToTotalPercent(value) : value;
    }
  });
  const breakField = form.elements.namedItem("breakMinutes");
  if (breakField && Number.isFinite(Number(settings.breakMinutes))) {
    breakField.value = String(settings.breakMinutes);
  }
  globalThis.OveruurtjeSelectUI?.enhanceAll(settingsForm);
  globalThis.OveruurtjeSelectUI?.enhanceAll(form);
  updateGuestExplanationLink(settings);
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
    minimumHours: settings.minimumHours,
    enableHalfDayUnder6Hours: settings.enableHalfDayUnder6Hours,
    enableOvertime10To12: settings.enableOvertime10To12,
    enableOvertimeFrom12: settings.enableOvertimeFrom12,
    enableOvertimeFrom14: settings.enableOvertimeFrom14,
    enableNightTariff: settings.enableNightTariff,
    nightSurchargePercent: settings.nightSurchargePercent,
    nightStart: settings.nightStart,
    nightEnd: settings.nightEnd,
    mileageRate: settings.kilometerRate,
    travelWithinEuropePercent: settings.travelWithinEuropePercent,
    travelOutsideEuropePercent: settings.travelOutsideEuropePercent,
    parkingDefaultAmount: currentAccountSettings?.parkingDefaultAmount || 0,
    droneVisible: currentAccountSettings?.droneVisible ?? false,
    roninVisible: currentAccountSettings?.roninVisible ?? false,
    droneTariffAmount: currentAccountSettings?.droneTariffAmount ?? equipmentTariffs.drone,
    roninTariffAmount: currentAccountSettings?.roninTariffAmount ?? equipmentTariffs.ronin,
    frequentClients: currentAccountSettings?.frequentClients || [],
    preferences: currentAccountSettings?.preferences || {}
  };
}

function renderTextSuggestions(container, values) {
  if (!container) return;
  container.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    return option;
  }));
}

function refreshPlanningSuggestions() {
  renderTextSuggestions(clientNameSuggestions, currentAccountSettings?.frequentClients || []);
  renderTextSuggestions(workdayNameSuggestions, knownWorkdayNames);
}

async function rememberCurrentClient() {
  const value = String(form.elements.namedItem("clientName")?.value || "").trim();
  if (!currentAccountUser || !value) return false;
  const exists = (currentAccountSettings?.frequentClients || [])
    .some((item) => item.localeCompare(value, "nl-NL", { sensitivity: "base" }) === 0);
  if (exists) return false;
  const frequentClients = accountSettingsService.normalizeTextList([
    ...(currentAccountSettings?.frequentClients || []),
    value
  ]);
  const saved = await accountSettingsService.save(currentAccountUser.id, {
    ...getAccountSettingsSnapshot(),
    frequentClients
  });
  currentAccountSettings = saved;
  refreshPlanningSuggestions();
  return true;
}

function applyAccountSettings(accountSettings, isPro) {
  if (!accountSettings) return;
  resetDailyExtras();
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
    minimumHours: accountSettings.minimumHours,
    enableHalfDayUnder6Hours: accountSettings.enableHalfDayUnder6Hours,
    enableOvertime10To12: accountSettings.enableOvertime10To12,
    enableOvertimeFrom12: accountSettings.enableOvertimeFrom12,
    enableOvertimeFrom14: accountSettings.enableOvertimeFrom14,
    enableNightTariff: accountSettings.enableNightTariff,
    nightSurchargePercent: accountSettings.nightSurchargePercent,
    nightStart: accountSettings.nightStart,
    nightEnd: accountSettings.nightEnd,
    kilometerRate: accountSettings.mileageRate,
    travelWithinEuropePercent: accountSettings.travelWithinEuropePercent,
    travelOutsideEuropePercent: accountSettings.travelOutsideEuropePercent
  });

  const departmentField = form.querySelector(`input[name="department"][value="${accountSettings.defaultDepartment}"]`);
  if (departmentField) departmentField.checked = true;
  departmentSwitch.classList.add("is-account-locked");
  departmentSwitch.setAttribute("aria-disabled", "true");
  updateProjectCreateAccess(isPro);
  departmentSwitch.querySelectorAll(".department-choice").forEach((choice) => {
    const input = choice.querySelector("input");
    if (choice.classList.contains("department-choice-pro")) {
      choice.hidden = true;
      input.disabled = true;
      return;
    }
    choice.hidden = !input.checked;
    input.disabled = !input.checked;
  });
  updateDepartmentVisibility();
  updateKilometerVisibility();
  updateParkingVisibility();
  updateNightSettingsVisibility();
  updateRateSettingsVisibility();
  updatePauseVisibility();
  updateCalculation();
}

function selectedWorkFunction() {
  return activeWorkFunction;
}

function getWorkFunctionPreset() {
  return {
    settings: getSettingsFromForm(),
    // Extra's horen bij een specifieke werkdag en zijn nooit functiestandaarden.
    extras: {}
  };
}

function resetDailyExtras() {
  ["enableDroneTariff", "enableRonin4dTariff", "enableKilometers", "enableParkingCosts", "enableTravelDay"].forEach((name) => {
    const field = form.elements.namedItem(name);
    if (field) field.checked = false;
  });
  if (form.elements.namedItem("kilometers")) form.elements.namedItem("kilometers").value = "0";
  if (form.elements.namedItem("parkingCosts")) form.elements.namedItem("parkingCosts").value = "0";
  if (form.elements.namedItem("travelRegion")) form.elements.namedItem("travelRegion").value = "within_europe";
  customEquipmentOptions.querySelectorAll("[data-custom-equipment-id]").forEach((field) => {
    field.checked = false;
  });
}

function renderWorkFunctions(items) {
  workFunctions = items;
  const isPro = Boolean(currentUserContext?.isPro);
  activeWorkFunction = isPro ? (items.find((item) => item.isDefault) || items[0] || null) : null;
  activeFunctionName.hidden = !activeWorkFunction;
  departmentSwitch.hidden = Boolean(activeWorkFunction);
  if (!isPro || !items.length) {
    activeFunctionName.textContent = "";
    return;
  }
  applyWorkFunction(activeWorkFunction);
}

function applyWorkFunction(workFunction, { preserveRate = false, preserveSettings = false } = {}) {
  if (!workFunction) return;
  activeWorkFunction = workFunction;
  activeFunctionName.textContent = workFunction.name;
  activeFunctionName.hidden = false;
  departmentSwitch.hidden = true;
  const departmentField = form.querySelector(`input[name="department"][value="${workFunction.department}"]`);
  if (departmentField) departmentField.checked = true;
  departmentSwitch.querySelectorAll(".department-choice").forEach((choice) => {
    const input = choice.querySelector("input");
    if (choice.classList.contains("department-choice-pro")) {
      choice.hidden = true;
      input.disabled = true;
      return;
    }
    choice.hidden = !input.checked;
    input.disabled = !input.checked;
  });
  const preset = workFunction.calculationSettings || {};
  if (!preserveRate && !preserveSettings) {
    if (preset.equipmentVisibility) {
      accountEquipmentVisibility = {
        drone: Boolean(preset.equipmentVisibility.drone),
        ronin: Boolean(preset.equipmentVisibility.ronin)
      };
    }
    if (preset.settings) {
      equipmentTariffs = {
        drone: Number(preset.settings.droneTariffAmount) || equipmentTariffs.drone,
        ronin: Number(preset.settings.ronin4dTariffAmount) || equipmentTariffs.ronin
      };
    }
    populateSettings({
      ...getSettingsFromForm(),
      ...(preset.settings || {}),
      dayRate: workFunction.dayRate
    });
  }
  updateDepartmentVisibility();
  updateRateSettingsVisibility();
  updateNightSettingsVisibility();
  updatePauseVisibility();
  updateKilometerVisibility();
  updateParkingVisibility();
  updateTravelVisibility();
}

async function syncActiveWorkFunction() {
  if (!currentAccountUser || !currentUserContext?.isPro || !activeWorkFunction?.id) return;
  try {
    const preset = getWorkFunctionPreset();
    const saved = await functionService.update(currentAccountUser.id, activeWorkFunction.id, {
      ...activeWorkFunction,
      dayRate: preset.settings.dayRate,
      calculationSettings: preset
    });
    workFunctions = workFunctions.map((item) => item.id === saved.id ? saved : item);
    activeWorkFunction = saved;
  } catch (error) {
    console.warn("Functie-instellingen konden niet worden opgeslagen.", error);
  }
}

function scheduleActiveWorkFunctionSync() {
  if (!currentUserContext?.isPro || !activeWorkFunction) return;
  clearTimeout(functionSyncTimer);
  functionSyncTimer = setTimeout(() => syncActiveWorkFunction(), 900);
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
    workdayName: String(form.elements.namedItem("workdayName")?.value || "").trim(),
    clientName: String(form.elements.namedItem("clientName")?.value || "").trim(),
    date: form.elements.namedItem("date").value,
    department: formData.get("department") || "camera",
    workFunction: selectedWorkFunction() ? {
      id: selectedWorkFunction().id,
      name: selectedWorkFunction().name,
      department: selectedWorkFunction().department
    } : null,
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
      enableTravelDay: readCheckbox(formData, "enableTravelDay"),
      travelRegion: formData.get("travelRegion") || "within_europe",
      travelPercent: readCheckbox(formData, "enableTravelDay")
        ? (formData.get("travelRegion") === "outside_europe"
          ? settings.travelOutsideEuropePercent
          : settings.travelWithinEuropePercent)
        : 0,
      customEquipment: getSelectedCustomEquipment()
    },
    sharedSourceType: currentSharedSource?.type || "",
    sharedSourceId: currentSharedSource?.id || "",
    sharedOwnerName: currentSharedOwnerName || "",
    result: endTime && latestResult && !calculationIsStale ? {
      totalHours: latestResult.totalHours,
      overtimeHours: latestResult.overtimeHours,
      nightHours: latestResult.nightHours,
      subtotalExVat: latestResult.subtotalExVat
    } : null
  };
}

function projectDayToWorkdaySnapshot(project, day) {
  const data = day?.calculationData || {};
  const currentSettings = getSettingsFromForm();
  const selectValue = (name, value, fallback) => {
    const field = settingsForm.elements.namedItem(name);
    const normalized = String(value ?? "");
    return field instanceof HTMLSelectElement
      && [...field.options].some((option) => option.value === normalized)
      ? Number(normalized)
      : fallback;
  };
  const validTime = (value, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""))
    ? String(value)
    : fallback;
  const finiteNumber = (value, fallback, minimum = 0, maximum = Number.POSITIVE_INFINITY) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
  };
  const normalDayHours = selectValue("normalDayHours", data.normalDayHours, currentSettings.normalDayHours);
  const rateMode = data.rateMode === "hour" ? "hour" : "day";
  const rateAmount = Number(data.rateAmount);
  const dayRate = rateMode === "day" && Number.isFinite(rateAmount) && rateAmount >= 0
    ? rateAmount
    : currentSettings.dayRate;
  const hourlyRate = rateMode === "hour" && Number.isFinite(rateAmount) && rateAmount >= 0
    ? rateAmount
    : finiteNumber(dayRate / normalDayHours, currentSettings.hourlyRate);
  return {
    schemaVersion: 1,
    workdayName: "",
    clientName: project?.clientName || "",
    date: day.workDate,
    department: data.department || currentAccountSettings?.defaultDepartment || "camera",
    workFunction: data.workFunctionId ? {
      id: data.workFunctionId,
      name: data.workFunctionName || "",
      department: data.department || "camera"
    } : null,
    startTime: data.startTime || "08:00",
    endTime: data.endTime || "",
    breakMinutes: Number(data.breakMinutes) || 0,
    settings: {
      ...currentSettings,
      rateMode,
      dayRate,
      hourlyRate,
      enableBreak: Boolean(currentSettings.enableBreak || Number(data.breakMinutes) > 0),
      breakMinutes: Number(data.breakMinutes) || 0,
      normalDayHours,
      minimumHours: selectValue("minimumHours", data.minimumHours, currentSettings.minimumHours),
      enableHalfDayUnder6Hours: Boolean(data.enableHalfDayUnder6Hours),
      enableOvertime10To12: Boolean(data.enableOvertime10To12),
      enableOvertimeFrom12: Boolean(data.enableOvertimeFrom12),
      enableOvertimeFrom14: Boolean(data.enableOvertimeFrom14),
      enableNightTariff: Boolean(data.enableNightTariff),
      nightSurchargePercent: finiteNumber(data.nightSurchargePercent, 100, 0, 500),
      nightStart: validTime(data.nightStart, currentSettings.nightStart),
      nightEnd: validTime(data.nightEnd, currentSettings.nightEnd),
      kilometerRate: finiteNumber(data.kilometerRate, currentSettings.kilometerRate),
      travelWithinEuropePercent: data.enableTravelDay && data.travelRegion !== "outside_europe"
        ? Number(data.travelPercent) || currentSettings.travelWithinEuropePercent
        : currentSettings.travelWithinEuropePercent,
      travelOutsideEuropePercent: data.enableTravelDay && data.travelRegion === "outside_europe"
        ? Number(data.travelPercent) || currentSettings.travelOutsideEuropePercent
        : currentSettings.travelOutsideEuropePercent
    },
    extras: {
      enableDroneTariff: Boolean(data.enableDroneTariff),
      enableRonin4dTariff: Boolean(data.enableRonin4dTariff),
      enableKilometers: Boolean(data.enableKilometers),
      kilometers: Number(data.kilometers) || 0,
      enableParkingCosts: Boolean(data.enableParkingCosts),
      parkingCosts: Number(data.parkingCosts) || 0,
      enableTravelDay: Boolean(data.enableTravelDay),
      travelRegion: data.travelRegion === "outside_europe" ? "outside_europe" : "within_europe",
      travelPercent: Number(data.travelPercent) || 0,
      customEquipment: Array.isArray(data.customEquipment) ? data.customEquipment : []
    },
    result: null,
    projectName: project?.name || ""
  };
}

function workdaySnapshotToProjectDay(snapshot, existing = {}) {
  const settings = snapshot.settings || {};
  const extras = snapshot.extras || {};
  return {
    ...existing,
    startTime: snapshot.startTime,
    endTime: snapshot.endTime,
    breakMinutes: Number(snapshot.breakMinutes) || 0,
    workFunctionId: snapshot.workFunction?.id || existing.workFunctionId || "",
    workFunctionName: snapshot.workFunction?.name || existing.workFunctionName || "",
    department: snapshot.department || existing.department || "camera",
    rateMode: settings.rateMode === "hour" ? "hour" : "day",
    rateAmount: settings.rateMode === "hour" ? settings.hourlyRate : settings.dayRate,
    normalDayHours: settings.normalDayHours,
    minimumHours: settings.minimumHours,
    enableHalfDayUnder6Hours: Boolean(settings.enableHalfDayUnder6Hours),
    enableOvertime10To12: Boolean(settings.enableOvertime10To12),
    enableOvertimeFrom12: Boolean(settings.enableOvertimeFrom12),
    enableOvertimeFrom14: Boolean(settings.enableOvertimeFrom14),
    enableNightTariff: Boolean(settings.enableNightTariff),
    nightSurchargePercent: Number(settings.nightSurchargePercent) || 0,
    nightStart: settings.nightStart,
    nightEnd: settings.nightEnd,
    enableTravelDay: Boolean(extras.enableTravelDay),
    travelRegion: extras.travelRegion === "outside_europe" ? "outside_europe" : "within_europe",
    travelPercent: Number(extras.travelPercent) || (extras.travelRegion === "outside_europe"
      ? Number(settings.travelOutsideEuropePercent) || 0
      : Number(settings.travelWithinEuropePercent) || 0),
    enableKilometers: Boolean(extras.enableKilometers),
    kilometers: Number(extras.kilometers) || 0,
    kilometerRate: Number(settings.kilometerRate) || 0,
    enableParkingCosts: Boolean(extras.enableParkingCosts),
    parkingCosts: Number(extras.parkingCosts) || 0,
    enableDroneTariff: Boolean(extras.enableDroneTariff),
    enableRonin4dTariff: Boolean(extras.enableRonin4dTariff),
    customEquipment: Array.isArray(extras.customEquipment) ? extras.customEquipment : [],
  };
}

function clearCalculationDisplay() {
  [
    "totalHours", "overtimeHours", "overtime10To12Hours", "overtimeFrom12Hours",
    "overtimeFrom14Hours", "nightHours", "nightOvertimeHours", "pureNightHours"
  ].forEach((name) => setResult(name, 0));
  [
    "baseAmount", "travelDayAmount", "overtimeAmount", "nightAmount", "droneTariffAmount",
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

async function refreshCurrentWorkdayParticipants() {
  if (!currentWorkdayParticipants || !currentWorkdayParticipantList) return;
  const source = currentSharedSource
    ? currentSharedSource
    : currentProjectDayContext?.day?.id
    ? { type: "project_day", id: currentProjectDayContext.day.id }
    : currentWorkdayId
    ? { type: "workday", id: currentWorkdayId }
    : currentShareWorkdayId
    ? { type: "workday", id: currentShareWorkdayId }
    : null;
  if (!currentAccountUser || !source?.type || !source?.id || !shareService) {
    sharedParticipants = [];
    renderCurrentWorkdayParticipants();
    updateWorkdaySaveAccess();
    return;
  }
  try {
    let participants = [];
    let sentShares = [];
    try {
      participants = await shareService.listParticipants(source.type, source.id);
    } catch (error) {
      console.warn("De centrale deelnemerslijst is nog niet beschikbaar.", error);
    }
    if (!currentSharedSource) {
      try {
        sentShares = await shareService.listSent(source.type, source.id);
      } catch (error) {
        console.warn("Verzonden uitnodigingen konden niet worden geladen.", error);
      }
    }
    const participantIds = new Set(participants.map((participant) => participant.userId));
    const acceptedRecipients = sentShares
      .filter((share) => share.acceptedAt && share.recipientId && !participantIds.has(share.recipientId))
      .map((share) => ({
        userId: share.recipientId,
        firstName: String(share.recipientName || share.recipientEmail || "Collega").trim().split(/\s+/)[0],
        isOwner: false,
        isCurrentUser: false,
        hasAccount: true,
        avatarUrl: "",
        selectedBadgeIcon: "",
        selectedBadgeName: "",
        jointWorkdays: 0
      }));
    sharedParticipants = [...participants, ...acceptedRecipients];
    const profile = currentUserContext?.profile;
    if (!sharedParticipants.some((participant) => participant.isCurrentUser)) {
      sharedParticipants.unshift({
        userId: currentAccountUser.id,
        firstName: String(profile?.displayName || currentAccountUser.email || "Jij").trim().split(/\s+/)[0],
        isOwner: !currentSharedSource,
        isCurrentUser: true,
        hasAccount: true,
        avatarUrl: profile?.avatarUrl || "",
        selectedBadgeIcon: "",
        selectedBadgeName: "",
        jointWorkdays: 0
      });
    }
    if (
      currentSharedSource
      && currentSharedOwnerName
      && !sharedParticipants.some((participant) => participant.isOwner)
    ) {
      sharedParticipants.unshift({
        userId: "",
        firstName: currentSharedOwnerName.trim().split(/\s+/)[0] || "Collega",
        isOwner: true,
        isCurrentUser: false,
        hasAccount: true,
        avatarUrl: "",
        selectedBadgeIcon: "",
        selectedBadgeName: "",
        jointWorkdays: 0
      });
    }
    if (currentSharedSource && !currentSharedOwnerName) {
      currentSharedOwnerName = sharedParticipants.find((participant) => participant.isOwner)?.firstName || "";
      updateSharedReceiverMode();
    }
    renderCurrentWorkdayParticipants();
    updateWorkdaySaveAccess();
  } catch (error) {
    console.warn("Deelnemers konden niet worden ververst.", error);
    // Keep the last known list during a transient network or schema-cache error.
    renderCurrentWorkdayParticipants();
    updateWorkdaySaveAccess();
  }
}

async function refreshSharedReceiverTimes({ announce = false } = {}) {
  if (
    !currentSharedSource
    || !currentAccountUser
    || !shareService
    || currentUserContext?.subscription?.isMock
  ) return;

  try {
    const received = await shareService.listReceived();
    const shared = received.find((item) => (
      item.sourceType === currentSharedSource.type
      && item.sourceId === currentSharedSource.id
    ));
    if (!shared) return;
    currentReceivedShareId = shared.id;

    const startTime = form.elements.namedItem("startTime");
    const endTime = form.elements.namedItem("endTime");
    const workdayName = form.elements.namedItem("workdayName");
    const clientName = form.elements.namedItem("clientName");
    const previousEndTime = endTime.value;
    currentSharedSourceEndTime = shared.endTime || "";
    let changed = false;

    if (workdayName && workdayName.value !== (shared.workdayName || "")) {
      workdayName.value = shared.workdayName || "";
      changed = true;
    }
    if (clientName && clientName.value !== (shared.clientName || "")) {
      clientName.value = shared.clientName || "";
      changed = true;
    }
    if (currentSharedOwnerName !== (shared.ownerName || "")) {
      currentSharedOwnerName = shared.ownerName || "";
      changed = true;
    }

    if (!sharedTimeOverrides.has("startTime") && startTime.value !== shared.startTime) {
      startTime.value = shared.startTime || "";
      changed = true;
    }
    if (
      !sharedReceiverCalculatedEarly
      && !sharedTimeOverrides.has("endTime")
      && endTime.value !== shared.endTime
    ) {
      endTime.value = shared.endTime || "";
      delete endTime.dataset.timePicked;
      delete endTime.dataset.liveCalculated;
      delete endTime.dataset.liveStopped;
      if (shared.endTime) endTime.dataset.timeRestored = "true";
      else delete endTime.dataset.timeRestored;
      changed = true;
    }
    if (!changed) return;

    updateSharedReceiverMode();
    liveWorkdayController?.update();
    if (endTime.value) updateCalculation();
    else clearCalculationDisplay();
    updateResumeLiveAccess();

    if (announce && !previousEndTime && endTime.value) {
      sessionUi?.showToast(`${shared.ownerName} heeft de eindtijd vastgelegd.`);
    }
  } catch (error) {
    console.warn("Gedeelde tijden konden niet worden ververst.", error);
  }
}

function updateSharedReceiverSync() {
  clearInterval(sharedReceiverSyncTimer);
  sharedReceiverSyncTimer = null;
  if (!currentSharedSource || !currentAccountUser) return;
  refreshSharedReceiverTimes();
  sharedReceiverSyncTimer = setInterval(
    () => refreshSharedReceiverTimes({ announce: true }),
    15000
  );
}

function renderCurrentWorkdayParticipants() {
  if (!currentWorkdayParticipants || !currentWorkdayParticipantList) return;
  const accountParticipants = [
    ...sharedParticipants.filter((participant) => participant.hasAccount !== false),
    ...(participantDemoEnabled() ? participantDemoProfiles : [])
  ];
  const chips = accountParticipants.map((participant) => {
    const chip = document.createElement(participant.isCurrentUser ? "span" : "button");
    chip.className = "participant-chip is-account";
    if (!participant.isCurrentUser) {
      chip.type = "button";
      if (participant.crewCard) chip.dataset.crewPreviewId = participant.userId;
      else chip.dataset.crewUserId = participant.userId;
      chip.title = `Bekijk de Crew Card van ${participant.firstName}`;
      chip.setAttribute("aria-label", `Bekijk de Crew Card van ${participant.firstName}`);
    }
    if (participant.avatarUrl) {
      const avatar = document.createElement("img");
      avatar.className = "participant-chip-avatar";
      avatar.src = participant.avatarUrl;
      avatar.alt = "";
      chip.append(avatar);
    }
    const name = document.createElement("span");
    name.className = "participant-chip-name";
    name.textContent = participant.isCurrentUser
      ? `${participant.firstName} (jij)`
      : participant.firstName;
    chip.append(name);
    if (participant.selectedBadgeIcon) {
      const badge = document.createElement("span");
      badge.className = "participant-chip-badge";
      badge.textContent = participant.selectedBadgeIcon;
      badge.title = participant.selectedBadgeName || "Geselecteerde badge";
      chip.append(badge);
    }
    return chip;
  });
  if (!chips.length) {
    const empty = document.createElement("small");
    empty.className = "participant-list-empty";
    empty.textContent = "Nodig een collega uit om dezelfde tijden te volgen.";
    chips.push(empty);
  }
  currentWorkdayParticipantList.replaceChildren(...chips);
  currentWorkdayParticipantList.hidden = false;
  // Keep the invite route available before somebody has accepted it.
  currentWorkdayParticipants.hidden = false;
}

function updateSharedReceiverMode() {
  const active = Boolean(currentSharedSource);
  form.classList.toggle("is-shared-receiver", active);
  if (sharedReceiverContext) sharedReceiverContext.hidden = !active;
  if (sharedReceiverTitle) {
    sharedReceiverTitle.textContent = currentSharedOwnerName
      ? `${currentSharedOwnerName} heeft deze werkdag met je gedeeld.`
      : "Een collega heeft deze werkdag met je gedeeld.";
  }

  const dateField = form.elements.namedItem("date");
  const timeFields = [
    form.elements.namedItem("startTime"),
    form.elements.namedItem("endTime")
  ].filter(Boolean);
  if (dateField) {
    dateField.disabled = active;
    dateField.setAttribute("aria-disabled", String(active));
  }
  timeFields.forEach((field) => {
    const locked = active && !sharedTimeOverrides.has(field.name);
    const control = field.closest(".time-control");
    field.dataset.sharedLocked = locked ? "true" : "false";
    field.setAttribute("aria-disabled", String(locked));
    control?.classList.toggle("is-shared-locked", locked);
    const trigger = control?.querySelector(".time-picker-trigger");
    if (trigger) trigger.disabled = locked;

    const lockButton = field.name === "startTime"
      ? sharedStartTimeLockButton
      : sharedEndTimeLockButton;
    if (lockButton) {
      const label = field.name === "startTime" ? "Starttijd" : "Eindtijd";
      lockButton.hidden = !active;
      lockButton.classList.toggle("is-unlocked", active && !locked);
      lockButton.setAttribute("aria-pressed", String(active && !locked));
      lockButton.setAttribute("aria-label", `${label} ${locked ? "ontgrendelen" : "vergrendelen"}`);
      lockButton.title = `${label} ${locked ? "ontgrendelen" : "vergrendelen"}`;
    }
  });
  if (projectCreateLink) projectCreateLink.hidden = active;
  const workdayName = form.elements.namedItem("workdayName");
  if (workdayName) {
    workdayName.disabled = active;
    workdayName.setAttribute("aria-disabled", String(active));
    workdayName.closest("label")?.classList.toggle("is-shared-readonly", active);
  }
  const clientName = form.elements.namedItem("clientName");
  if (clientName) {
    clientName.disabled = active;
    clientName.setAttribute("aria-disabled", String(active));
    clientName.closest("label")?.classList.toggle("is-shared-readonly", active);
  }
  if (shareFromParticipantsButton) shareFromParticipantsButton.hidden = active;
  if (resumeLiveWorkdayButton && active) resumeLiveWorkdayButton.hidden = true;
  if (resumeSharedWorkdayButton) {
    resumeSharedWorkdayButton.hidden = !active || !sharedReceiverCalculatedEarly;
  }
  updateSharedReceiverSync();
}

function applyWorkdaySnapshot(workday, { projectContext = null, freeActive = false } = {}) {
  const snapshot = workday?.calculationData || {};
  if (!snapshot.date) return;

  persistedWorkdayEndTime = snapshot.endTime || "";

  currentReceivedShareId = snapshot.importedFromShare || null;
  currentWorkdayId = projectContext || freeActive || currentReceivedShareId ? null : workday.id;
  currentProjectDayContext = projectContext;
  currentSharedSource = snapshot.sharedSourceType && snapshot.sharedSourceId
    ? { type: snapshot.sharedSourceType, id: snapshot.sharedSourceId }
    : null;
  currentSharedSourceEndTime = currentSharedSource ? (snapshot.endTime || "") : "";
  sharedReceiverCalculatedEarly = false;
  sharedTimeOverrides = new Set();
  currentSharedOwnerName = snapshot.sharedOwnerName || "";
  if (form.elements.namedItem("workdayName")) {
    form.elements.namedItem("workdayName").value = workday.name || snapshot.workdayName || "";
  }
  if (form.elements.namedItem("clientName")) {
    form.elements.namedItem("clientName").value = snapshot.clientName || "";
  }
  form.elements.namedItem("date").value = snapshot.date;
  form.elements.namedItem("startTime").value = snapshot.startTime || "08:00";
  const restoredEndTime = form.elements.namedItem("endTime");
  restoredEndTime.value = snapshot.endTime || "";
  liveWorkdayArmed = !snapshot.endTime;
  delete restoredEndTime.dataset.timePicked;
  delete restoredEndTime.dataset.liveCalculated;
  delete restoredEndTime.dataset.liveStopped;
  if (resumeLiveWorkdayButton) resumeLiveWorkdayButton.hidden = true;
  form.elements.namedItem("startTime").dataset.timeRestored = "true";
  if (snapshot.endTime) restoredEndTime.dataset.timeRestored = "true";
  else delete restoredEndTime.dataset.timeRestored;
  if (snapshot.settings) {
    const storedSettings = {
      ...snapshot.settings,
      nightSurchargePercent: Object.hasOwn(snapshot.settings, "nightSurchargePercent")
        ? snapshot.settings.nightSurchargePercent
        : 100
    };
    populateSettings({ ...getSettingsFromForm(), ...storedSettings });
  }
  if (snapshot.department) {
    const department = form.querySelector(`input[name="department"][value="${snapshot.department}"]`);
    if (department) department.checked = true;
  }
  const snapshotFunction = workFunctions.find((item) => item.id === snapshot.workFunction?.id);
  if (snapshotFunction) applyWorkFunction(snapshotFunction, { preserveRate: true, preserveSettings: true });
  form.elements.namedItem("breakMinutes").value = String(snapshot.breakMinutes || 0);

  const extras = snapshot.extras || {};
  resetDailyExtras();
  [
    "enableDroneTariff", "enableRonin4dTariff", "enableKilometers", "enableParkingCosts", "enableTravelDay"
  ].forEach((name) => {
    const field = form.elements.namedItem(name);
    if (field && !field.disabled) field.checked = Boolean(extras[name]);
  });
  form.elements.namedItem("kilometers").value = String(extras.kilometers || 0);
  form.elements.namedItem("parkingCosts").value = String(extras.parkingCosts || 0);
  if (form.elements.namedItem("travelRegion")) {
    form.elements.namedItem("travelRegion").value = extras.travelRegion === "outside_europe"
      ? "outside_europe"
      : "within_europe";
  }
  (extras.customEquipment || []).forEach((item) => {
    const field = customEquipmentOptions.querySelector(`[data-custom-equipment-id="${item.id}"]`);
    if (field) field.checked = Boolean(item.enabled);
  });

  updateDepartmentVisibility();
  updateKilometerVisibility();
  updateParkingVisibility();
  updateTravelVisibility();
  updateNightSettingsVisibility();
  updateRateSettingsVisibility();
  updatePauseVisibility();
  updateSharedReceiverMode();
  updateWorkdaySaveAccess();
  refreshCurrentWorkdayParticipants();
  const url = new URL(location.href);
  url.searchParams.delete("workday");
  url.searchParams.delete("project");
  url.searchParams.delete("projectDay");
  url.searchParams.delete("shared");
  if (currentReceivedShareId) {
    url.searchParams.set("shared", currentReceivedShareId);
  } else if (projectContext) {
    url.searchParams.set("project", projectContext.project.id);
    url.searchParams.set("projectDay", projectContext.day.id);
  } else if (!freeActive) {
    url.searchParams.set("workday", workday.id);
  }
  history.replaceState({}, "", url);
  if (snapshot.endTime) updateCalculation();
  else clearCalculationDisplay();
  requestAnimationFrame(() => {
    liveWorkdayController?.update();
    updateResumeLiveAccess();
  });
  sessionUi?.showToast(projectContext ? "Projectdag geopend." : "Werkdag geopend.");
}

function applyFreeActiveWorkday(record) {
  currentShareWorkdayId = record.sourceId || null;
  applyWorkdaySnapshot(record, { freeActive: true });
}

function projectDayUrl(entry) {
  const url = new URL("index.html", location.href);
  url.searchParams.set("project", entry.project.id);
  url.searchParams.set("projectDay", entry.day.id);
  return url;
}

function openExistingDateEntry(entry) {
  if (!entry) return;
  if (entry.kind === "shared") {
    location.href = `index.html?shared=${encodeURIComponent(entry.share.id)}`;
    return;
  }
  if (entry.kind === "free-active") {
    applyFreeActiveWorkday(entry.workday);
    return;
  }
  if (entry.kind === "project-day") {
    location.href = projectDayUrl(entry).href;
    return;
  }
  applyWorkdaySnapshot(entry.workday);
}

async function listExistingDateEntries(date) {
  const options = { mock: currentUserContext?.subscription?.isMock };
  const [workdays, projectDays] = await Promise.all([
    workdayService.listByDate(currentAccountUser.id, date, options),
    projectService.listDaysByDate(currentAccountUser.id, date, options)
  ]);
  return [
    ...projectDays
      .filter(({ project }) => project.startDate <= date && project.endDate >= date)
      .map(({ project, day }) => ({ kind: "project-day", project, day })),
    ...workdays.map((workday) => ({ kind: "workday", workday }))
  ];
}

function dateEntryWorkDate(entry) {
  return entry?.kind === "project-day"
    ? entry.day?.workDate || ""
    : entry?.workday?.workDate || entry?.workday?.calculationData?.date || "";
}

function dateEntryCalculationData(entry) {
  return entry?.kind === "project-day"
    ? entry.day?.calculationData || {}
    : entry?.workday?.calculationData || {};
}

function dateEntryUpdatedAt(entry) {
  return entry?.kind === "project-day"
    ? entry.day?.updatedAt || entry.project?.updatedAt || ""
    : entry?.workday?.updatedAt || "";
}

function isRunningDateEntry(entry, now = new Date()) {
  const data = dateEntryCalculationData(entry);
  return Boolean(globalThis.OveruurtjeLiveWorkday?.isRunning?.({
    date: dateEntryWorkDate(entry),
    startTime: data.startTime,
    endTime: data.endTime,
    now
  }));
}

async function findPreferredOwnDateEntry(now = new Date()) {
  const today = localDateValue(now);
  const yesterday = globalThis.OveruurtjeLiveWorkday?.previousLocalDateValue?.(now);
  const [todayEntries, yesterdayEntries] = await Promise.all([
    listExistingDateEntries(today),
    yesterday && yesterday !== today
      ? listExistingDateEntries(yesterday)
      : Promise.resolve([])
  ]);
  const running = [...todayEntries, ...yesterdayEntries]
    .filter((entry) => isRunningDateEntry(entry, now))
    .sort((a, b) => dateEntryUpdatedAt(b).localeCompare(dateEntryUpdatedAt(a)));
  return running[0] || todayEntries[0] || null;
}

async function listOwnEntriesForSharedDate(date) {
  if (currentUserContext?.isPro) return listExistingDateEntries(date);
  const localWorkday = freeActiveWorkdayService.load(currentAccountUser.id);
  if (!localWorkday || localWorkday.workDate !== date) return [];
  return [{ kind: "free-active", workday: localWorkday }];
}

function configureDuplicateWorkdayDialog(entry) {
  const projectDay = entry?.kind === "project-day";
  document.querySelector("#duplicate-workday-title").textContent = projectDay
    ? "Voor deze datum bestaat al een werkdag in een project."
    : "Voor deze datum bestaat al een opgeslagen werkdag.";
  document.querySelector("#duplicate-workday-copy").textContent = projectDay
    ? `Deze werkdag hoort bij project “${entry.project.name}”. Wil je die projectdag verder bewerken of een nieuwe losse werkdag maken?`
    : "Wil je de bestaande werkdag openen of een tweede werkdag voor dezelfde datum maken?";
  document.querySelector("#open-existing-workday").textContent = projectDay
    ? "Projectdag verder bewerken"
    : "Doorgaan met bewerken";
  document.querySelector("#create-duplicate-workday").textContent = projectDay
    ? "Nieuwe losse werkdag op deze datum"
    : "Nieuwe werkdag op deze datum";
}

function configureTodayWorkdayDialog(entry) {
  const projectDay = entry?.kind === "project-day";
  const freeActive = entry?.kind === "free-active";
  const shared = entry?.kind === "shared";
  const running = projectDay || entry?.kind === "workday"
    ? isRunningDateEntry(entry)
    : false;
  const entryDate = dateEntryWorkDate(entry);
  const startedEarlier = running && entryDate && entryDate !== localDateValue();
  document.querySelector("#today-workday-title").textContent = shared
    ? "Je hebt nog een gedeelde werkdag lopen."
    : projectDay && running
    ? `Je projectdag in “${entry.project.name}” loopt nog.`
    : projectDay
    ? `Vandaag staat er een werkdag in project “${entry.project.name}”.`
    : freeActive
      ? "Je hebt nog een actieve werkdag."
      : running
        ? "Je hebt nog een werkdag lopen."
      : "Je hebt vandaag al een werkdag opgeslagen.";
  document.querySelector("#today-workday-copy").textContent = shared
    ? `Je registreert deze werkdag samen met ${entry.share.ownerName || "een collega"}. Wil je verdergaan of een nieuwe berekening openen?`
    : running && startedEarlier
    ? "Deze werkdag begon gisteren en heeft nog geen eindtijd. Wil je verdergaan waar je gebleven was?"
    : projectDay
    ? "Wil je verdergaan met het bewerken van deze projectdag?"
    : freeActive
      ? "Wil je doorgaan met deze werkdag of een nieuwe berekening starten?"
      : "Wil je verdergaan met het bewerken van deze werkdag?";
  document.querySelector("#continue-today-workday").textContent = shared
    ? "Verder met gedeelde werkdag"
    : projectDay
    ? "Verder met deze projectdag"
    : "Verder met deze werkdag";
}

function showActiveSharedReminder(shared = activeSharedWorkday) {
  if (!activeSharedReminder || !shared) return;
  activeSharedWorkday = shared;
  activeSharedReminder.hidden = false;
  activeSharedReminderCopy.textContent = `${shared.ownerName || "Een collega"} · ${shared.workDate}`;
}

function hideActiveSharedReminder() {
  if (activeSharedReminder) activeSharedReminder.hidden = true;
}

async function findActiveReceivedShare() {
  if (!shareService || currentUserContext?.subscription?.isMock) return null;
  const received = await shareService.listReceived();
  const active = received
    .filter((item) => item.acceptedAt && !item.endTime)
    .sort((a, b) => String(b.sourceUpdatedAt || b.createdAt || "")
      .localeCompare(String(a.sourceUpdatedAt || a.createdAt || "")));
  return { selected: active[0] || null, all: active };
}

function activeContextDismissalKey() {
  return currentAccountUser ? `overuurtjeNewCalculation:${currentAccountUser.id}` : "";
}

function suppressActiveContextForSession() {
  const key = activeContextDismissalKey();
  if (key) sessionStorage.setItem(key, localDateValue());
}

function activeContextIsSuppressed() {
  const key = activeContextDismissalKey();
  return Boolean(key && sessionStorage.getItem(key) === localDateValue());
}

async function hasAcceptedSharedRecipients() {
  if (!currentAccountUser || !shareService || currentSharedSource) return false;
  const source = currentProjectDayContext
    ? { type: "project_day", id: currentProjectDayContext.day?.id }
    : { type: "workday", id: currentWorkdayId || currentShareWorkdayId };
  if (!source.id) return false;
  const sent = await shareService.listSent(source.type, source.id);
  return sent.some((item) => Boolean(item.acceptedAt));
}

async function persistFreeActiveWorkday(snapshot, { showToast = true } = {}) {
  if (!currentAccountUser || currentUserContext?.isPro || currentSharedSource || currentProjectDayContext) {
    return null;
  }
  if (!freeActiveWorkdayService.canSaveSnapshot(snapshot)) {
    throw new Error("Met Free kun je alleen de werkdag van vandaag of een doorlopende werkdag van gisteren bewaren.");
  }

  const sourceId = await shareService.prepareWorkdaySource({
    id: currentShareWorkdayId,
    name: snapshot.workdayName,
    workDate: snapshot.date,
    calculationData: snapshot
  });
  currentShareWorkdayId = sourceId;
  const saved = freeActiveWorkdayService.save(currentAccountUser.id, {
    sourceId,
    calculationData: snapshot
  });
  persistedWorkdayEndTime = snapshot.endTime || "";
  try {
    await rememberCurrentClient();
  } catch (error) {
    console.warn("Opdrachtgever automatisch opslaan is mislukt.", error);
  }
  updateWorkdaySaveAccess();
  refreshCurrentWorkdayParticipants();
  if (showToast) sessionUi?.showToast("Werkdag bewaard. Je kunt deze later hervatten.");
  return saved;
}

async function persistWorkday(snapshot, id = null) {
  const saved = await workdayService.save(currentAccountUser.id, {
    id,
    name: snapshot.workdayName,
    workDate: snapshot.date,
    calculationData: snapshot
  }, { mock: currentUserContext?.subscription?.isMock });
  try {
    await rememberCurrentClient();
  } catch (error) {
    console.warn("Opdrachtgever automatisch opslaan is mislukt.", error);
  }
  currentWorkdayId = saved.id;
  persistedWorkdayEndTime = snapshot.endTime || "";
  updateWorkdaySaveAccess();
  refreshCurrentWorkdayParticipants();
  const url = new URL(location.href);
  url.searchParams.set("workday", saved.id);
  history.replaceState({}, "", url);
  sessionUi?.showToast("Werkdag opgeslagen.");
  await trackBadgeActivity("workday_saved", saved.id);
  return saved;
}

async function persistProjectDay(snapshot) {
  if (!currentProjectDayContext?.project?.id || !currentProjectDayContext?.day?.id) {
    throw new Error("Projectdag niet gevonden.");
  }
  const { project, day } = currentProjectDayContext;
  const savedDay = await projectService.saveDay(currentAccountUser.id, project.id, {
    id: day.id,
    workDate: snapshot.date,
    calculationData: workdaySnapshotToProjectDay(snapshot, day.calculationData)
  }, { mock: currentUserContext?.subscription?.isMock });
  try {
    await rememberCurrentClient();
  } catch (error) {
    console.warn("Opdrachtgever automatisch opslaan is mislukt.", error);
  }
  currentProjectDayContext = { project, day: savedDay };
  persistedWorkdayEndTime = snapshot.endTime || "";
  updateWorkdaySaveAccess();
  refreshCurrentWorkdayParticipants();
  sessionUi?.showToast("Projectdag opgeslagen.");
  await trackBadgeActivity("project_day_saved", savedDay.id);
  return savedDay;
}

async function saveWorkday({ allowDuplicate = false, skipCompletionConfirmation = false } = {}) {
  const date = form.elements.namedItem("date").value;
  if (!date) return;
  if (currentSharedSource && currentReceivedShareId && currentAccountUser) {
    workdaySaveButton.disabled = true;
    try {
      const snapshot = buildWorkdaySnapshot();
      await shareService.saveRecipientCalculation(currentReceivedShareId, snapshot);
      sessionUi?.showToast("Jouw instellingen bij deze gedeelde werkdag zijn opgeslagen.");
      return snapshot;
    } catch (error) {
      console.warn("Eigen instellingen bij gedeelde werkdag opslaan is mislukt.", error);
      sessionUi?.showToast(error.message || "Je instellingen konden niet worden opgeslagen.");
      return null;
    } finally {
      updateWorkdaySaveAccess();
    }
  }
  const snapshot = buildWorkdaySnapshot();
  if (
    !skipCompletionConfirmation
    && !persistedWorkdayEndTime
    && snapshot.endTime
    && await hasAcceptedSharedRecipients()
  ) {
    pendingSharedCompletionSave = { allowDuplicate };
    sharedCompletionCopy.textContent = `De eindtijd is berekend op ${snapshot.endTime}. Na het opslaan krijgen je collega's een melding dat de werkdag is afgerond. Je kunt de tijden later altijd aanpassen.`;
    openNativeDialog(sharedCompletionDialog);
    return null;
  }
  if (!currentUserContext?.isPro) {
    if (!currentAccountUser || currentSharedSource || currentProjectDayContext) {
      sessionUi?.openUpgrade();
      return;
    }
    workdaySaveButton.disabled = true;
    try {
      return await persistFreeActiveWorkday(snapshot);
    } catch (error) {
      console.warn("Free-werkdag bewaren is mislukt.", error);
      sessionUi?.showToast(error.message || "Werkdag bewaren is niet gelukt.");
      return null;
    } finally {
      updateWorkdaySaveAccess();
    }
  }

  workdaySaveButton.disabled = true;
  try {
    if (currentProjectDayContext) {
      return await persistProjectDay(snapshot);
    }
    if (currentWorkdayId) {
      return await persistWorkday(snapshot, currentWorkdayId);
    }
    if (!allowDuplicate) {
      const existing = await listExistingDateEntries(date);
      if (existing.length) {
        pendingDuplicateWorkday = { snapshot, existing: existing[0] };
        configureDuplicateWorkdayDialog(existing[0]);
        openNativeDialog(duplicateWorkdayDialog);
        return;
      }
    }
    return await persistWorkday(snapshot);
  } catch (error) {
    console.warn("Werkdag opslaan is mislukt.", error);
    sessionUi?.showToast(error.message || "Werkdag opslaan is niet gelukt.");
  } finally {
    updateWorkdaySaveAccess();
  }
  return null;
}

function updateWorkdaySaveAccess() {
  if (!workdaySaveButton) return;
  const hasDate = Boolean(form.elements.namedItem("date").value);
  const hasStartTime = Boolean(form.elements.namedItem("startTime").value);
  const isPro = Boolean(currentUserContext?.isPro);
  const canSaveFreeActive = Boolean(
    currentAccountUser
    && !isPro
    && !currentSharedSource
    && !currentProjectDayContext
    && freeActiveWorkdayService.canSaveSnapshot({
      date: form.elements.namedItem("date").value,
      startTime: form.elements.namedItem("startTime").value,
      endTime: form.elements.namedItem("endTime").value
    })
  );
  const isProjectDay = Boolean(currentProjectDayContext);
  const isSharedReceiver = Boolean(currentSharedSource);
  const hasSharedRecipient = !isSharedReceiver && sharedParticipants.some(
    (participant) => !participant.isOwner && !participant.isCurrentUser && participant.hasAccount !== false
  );
  if (workdayNameField) workdayNameField.hidden = isProjectDay;
  const workdayName = form.elements.namedItem("workdayName");
  if (workdayName) workdayName.disabled = isSharedReceiver;
  if (projectCreateLink) projectCreateLink.hidden = isSharedReceiver;
  if (projectDayContextPanel) projectDayContextPanel.hidden = !isProjectDay;
  if (isProjectDay) {
    projectDayContextName.textContent = currentProjectDayContext.project.name;
    projectDayContextDate.textContent = new Intl.DateTimeFormat("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(`${currentProjectDayContext.day.workDate}T12:00:00`));
    projectDayContextLink.href = `projects.html?project=${encodeURIComponent(currentProjectDayContext.project.id)}`;
  }
  workdaySaveButton.disabled = !hasDate;
  workdaySaveButton.classList.toggle("is-pro-locked", !isSharedReceiver && !isPro && !canSaveFreeActive);
  if (workdaySaveLabel) {
    workdaySaveLabel.textContent = isProjectDay
      ? "Projectdag bijwerken"
      : isSharedReceiver
        ? "Mijn instellingen opslaan"
      : currentWorkdayId
        ? "Werkdag bijwerken"
      : "Bewaar voor later";
  }
  if (workdaySaveHint) {
    workdaySaveHint.hidden = false;
    workdaySaveHint.textContent = isSharedReceiver
      ? "Bewaar je eigen extra's en berekening bij deze gedeelde dag"
      : hasSharedRecipient
        ? "Opslaan werkt gedeelde tijden bij voor je collega's"
        : canSaveFreeActive
          ? "Blijf later verdergaan met deze actieve werkdag"
          : "Bewaar datum, begintijd en instellingen";
  }
  if (workdaySaveBadge) workdaySaveBadge.hidden = isSharedReceiver || isPro || canSaveFreeActive;
  workdaySaveButton.title = hasDate
    ? (isSharedReceiver || isPro || canSaveFreeActive ? "Werkdag bewaren" : "Werkdagen zijn beschikbaar met Pro")
    : "Vul eerst een datum in";
  if (shareFromParticipantsButton) {
    const hasAccount = Boolean(currentAccountUser);
    const canShare = !hasAccount || (hasDate && hasStartTime);
    shareFromParticipantsButton.hidden = isSharedReceiver;
    shareFromParticipantsButton.disabled = !canShare;
    shareFromParticipantsButton.title = !hasAccount
      ? "Maak een gratis account om een werkdag te delen"
      : canShare
        ? "Deel deze werkdag met collega's"
        : "Vul eerst een datum en starttijd in";
    shareFromParticipantsButton.setAttribute("aria-label", shareFromParticipantsButton.title);
  }
  if (
    !currentWorkdayId
    && !currentShareWorkdayId
    && !currentProjectDayContext
    && !currentSharedSource
  ) {
    sharedParticipants = [];
    renderCurrentWorkdayParticipants();
  }
}

async function initializeWorkdayContext() {
  if (!currentAccountUser || workdayContextInitializedFor === currentAccountUser.id) {
    return;
  }
  workdayContextInitializedFor = currentAccountUser.id;
  const search = new URLSearchParams(location.search);
  const requestedShareId = search.get("shared");
  const requestedId = search.get("workday");
  const requestedProjectId = search.get("project");
  const requestedProjectDayId = search.get("projectDay");
  try {
    if (search.get("new") === "1") {
      search.delete("new");
      history.replaceState({}, "", `${location.pathname}${search.toString() ? `?${search}` : ""}`);
      return;
    }
    if (requestedShareId || sessionStorage.getItem("overuurtjeSharedTimesImport")) return;

    if (currentUserContext?.isPro && requestedProjectId && requestedProjectDayId) {
      const requestedProject = await projectService.get(
        currentAccountUser.id,
        requestedProjectId,
        { mock: currentUserContext.subscription.isMock }
      );
      const requestedDay = requestedProject?.days.find((day) => day.id === requestedProjectDayId);
      if (!requestedProject || !requestedDay) {
        sessionUi?.showToast("Deze projectdag kon niet worden gevonden.");
        return;
      }
      applyWorkdaySnapshot({
        id: requestedDay.id,
        name: "",
        calculationData: projectDayToWorkdaySnapshot(requestedProject.project, requestedDay)
      }, {
        projectContext: {
          project: requestedProject.project,
          day: requestedDay
        }
      });
      return;
    }
    if (currentUserContext?.isPro && requestedId) {
      const requested = await workdayService.get(
        currentAccountUser.id,
        requestedId,
        { mock: currentUserContext.subscription.isMock }
      );
      if (requested) applyWorkdaySnapshot(requested);
      else sessionUi?.showToast("Deze werkdag kon niet worden gevonden.");
      return;
    }

    const activeShares = await findActiveReceivedShare();
    if (activeShares.selected) {
      activeSharedWorkday = activeShares.selected;
      const ownEntries = await listOwnEntriesForSharedDate(activeShares.selected.workDate);
      if (activeShares.all.length === 1 && ownEntries.length === 0) {
        location.replace(`index.html?shared=${encodeURIComponent(activeShares.selected.id)}`);
        return;
      }
      todayWorkday = { kind: "shared", share: activeShares.selected };
      configureTodayWorkdayDialog(todayWorkday);
      openNativeDialog(todayWorkdayDialog);
      return;
    }

    if (!currentUserContext?.isPro) {
      const active = freeActiveWorkdayService.load(currentAccountUser.id);
      if (active) {
        todayWorkday = { kind: "free-active", workday: active };
        configureTodayWorkdayDialog(todayWorkday);
        openNativeDialog(todayWorkdayDialog);
      }
      return;
    }

    const preferred = await findPreferredOwnDateEntry();
    if (preferred) {
      todayWorkday = preferred;
      configureTodayWorkdayDialog(todayWorkday);
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
    label.textContent = item.amount < 0 ? `${item.name} · correctie` : item.name;
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
  projectCreateLink.hidden = Boolean(currentSharedSource);
  projectCreateLink.classList.toggle("is-pro-locked", !isPro);
  projectCreateLink.setAttribute("aria-label", isPro ? "Project aanmaken" : "Project aanmaken is beschikbaar met Pro");
  const badge = projectCreateLink.querySelector(".project-pro-badge");
  if (badge) badge.hidden = isPro;
}

function applySharedTimesImport() {
  const raw = sessionStorage.getItem("overuurtjeSharedTimesImport");
  if (!raw) return;
  sessionStorage.removeItem("overuurtjeSharedTimesImport");
  try {
    const snapshot = JSON.parse(raw);
    applyWorkdaySnapshot({
      id: null,
      name: snapshot.workdayName || "",
      workDate: snapshot.date,
      calculationData: snapshot
    }, { freeActive: true });
    sessionUi?.showToast("Gedeelde tijden ingevuld. Voeg nu je eigen instellingen toe.");
  } catch {
    sessionUi?.showToast("Gedeelde tijden konden niet worden ingevuld.");
  }
}

async function restoreSharedTimesFromUrl() {
  const shareId = new URLSearchParams(location.search).get("shared");
  if (
    !shareId
    || !currentAccountUser
    || !shareService
    || currentUserContext?.subscription?.isMock
  ) return false;

  try {
    const received = await shareService.listReceived();
    const shared = received.find((item) => item.id === shareId);
    if (!shared) return false;
    const privateSnapshot = shared.recipientCalculationData
      && typeof shared.recipientCalculationData === "object"
      ? shared.recipientCalculationData
      : {};
    sessionStorage.setItem("overuurtjeSharedTimesImport", JSON.stringify({
      ...privateSnapshot,
      schemaVersion: privateSnapshot.schemaVersion || 1,
      workdayName: shared.workdayName || "",
      clientName: shared.clientName || "",
      date: shared.workDate,
      startTime: shared.startTime || "",
      endTime: shared.endTime || "",
      result: null,
      importedFromShare: shared.id,
      sharedSourceType: shared.sourceType || "",
      sharedSourceId: shared.sourceId || "",
      sharedOwnerName: shared.ownerName || ""
    }));
    applySharedTimesImport();
    activeSharedWorkday = shared;
    hideActiveSharedReminder();
    await shareService.markShareNotificationsRead(shareId);
    return true;
  } catch (error) {
    console.warn("De gedeelde werkdag kon niet vanuit de link worden hersteld.", error);
    return false;
  }
}

async function hydrateAccountSettings(context) {
  currentUserContext = context;
  currentAccountUser = context.auth.user;
  void updateAccountingExportVisibility(context);
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
    renderWorkFunctions([]);
    resetDailyExtras();
    currentWorkdayId = null;
    currentShareWorkdayId = null;
    currentSharedSource = null;
    currentReceivedShareId = null;
    currentSharedOwnerName = "";
    currentSharedSourceEndTime = "";
    sharedReceiverCalculatedEarly = false;
    sharedTimeOverrides = new Set();
    workdayContextInitializedFor = null;
    updateSharedReceiverMode();
    populateSettings(getSavedSettings());
    knownWorkdayNames = [];
    refreshPlanningSuggestions();
    departmentSwitch.classList.remove("is-account-locked");
    departmentSwitch.hidden = false;
    departmentSwitch.removeAttribute("aria-disabled");
    departmentSwitch.querySelectorAll(".department-choice").forEach((choice) => {
      if (choice.classList.contains("department-choice-pro")) {
        choice.hidden = false;
        choice.querySelector("input").disabled = true;
        return;
      }
      choice.hidden = false;
      choice.querySelector("input").disabled = false;
    });
    updateDepartmentVisibility();
    updatePauseVisibility();
    updateWorkdaySaveAccess();
    if (!(await restoreSharedTimesFromUrl())) applySharedTimesImport();
    return;
  }
  if (hydratedAccountUserId === currentAccountUser.id) return;
  currentShareWorkdayId = null;
  workdayContextInitializedFor = null;
  hydratedAccountUserId = currentAccountUser.id;

  try {
    const [savedResult, functionsResult, equipmentResult, workdaysResult] = await Promise.allSettled([
      accountSettingsService.load(currentAccountUser.id),
      context.isPro ? functionService.list(currentAccountUser.id) : Promise.resolve([]),
      context.isPro ? equipmentService.list(currentAccountUser.id) : Promise.resolve([]),
      context.isPro ? workdayService.list(currentAccountUser.id, { mock: context.subscription?.isMock }) : Promise.resolve([])
    ]);
    if (savedResult.status === "rejected") throw savedResult.reason;
    const saved = savedResult.value;
    let functions = functionsResult.status === "fulfilled" ? functionsResult.value : [];
    const equipment = equipmentResult.status === "fulfilled" ? equipmentResult.value : [];
    knownWorkdayNames = accountSettingsService.normalizeTextList(
      (workdaysResult.status === "fulfilled" ? workdaysResult.value : []).map((item) => item.name)
    );
    if (saved) {
      applyAccountSettings(saved, context.isPro);
    } else {
      applyAccountSettings(await syncAccountSettings() || accountSettingsService.defaults, context.isPro);
    }
    if (context.isPro && functionsResult.status === "fulfilled" && functions.length === 0) {
      const department = currentAccountSettings.defaultDepartment === "audio" ? "audio" : "camera";
      try {
        functions = [await functionService.create(currentAccountUser.id, {
          name: department === "audio" ? "Audio" : "Camera",
          department,
          dayRate: currentAccountSettings.defaultDayRate,
          isDefault: true,
          sortOrder: 0,
          calculationSettings: {}
        })];
      } catch (error) {
        functions = await functionService.list(currentAccountUser.id);
        if (!functions.length) throw error;
      }
    }
    renderCustomEquipment(context.isPro ? equipment : []);
    renderWorkFunctions(context.isPro ? functions : []);
    refreshPlanningSuggestions();
    updateCalculation();
    try {
      // Reconcile historical or previously missed badge awards whenever an
      // authenticated calculator session becomes ready.
      await badgeService?.evaluate?.();
    } catch (error) {
      console.warn("Badgecontrole bij het openen is niet gelukt.", error);
    }
    await initializeWorkdayContext();
  } catch (error) {
    console.warn("Accountinstellingen konden niet worden geladen.", error);
    applyAccountSettings(accountSettingsService.defaults, context.isPro);
    renderWorkFunctions([]);
    renderCustomEquipment([]);
    knownWorkdayNames = [];
    refreshPlanningSuggestions();
    await initializeWorkdayContext();
  }
  updateWorkdaySaveAccess();
  if (!(await restoreSharedTimesFromUrl())) applySharedTimesImport();
}

function formatHours(value) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${numberFormatter.format(value)} uur`;
}

function formatEuro(value) {
  if (!Number.isFinite(value) || value === 0) return "-";
  return euroFormatter.format(value);
}

function formatInvoiceDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value || "");
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
  if (!Number.isFinite(amount) || amount === 0) return;

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

  const workdayName = String(form.elements.namedItem("workdayName")?.value || "").trim();
  const clientName = String(form.elements.namedItem("clientName")?.value || "").trim();
  const date = form.elements.namedItem("date").value;
  const startTime = form.elements.namedItem("startTime").value;
  const endTime = form.elements.namedItem("endTime").value;
  const lines = document.querySelector("#print-calculation-lines");
  const usesHalfDayRate = !result.isTravelDay && result.baseAmount < result.settings.dayRate;

  setPrintValue("workdayName", workdayName || "-");
  document.querySelector('[data-print-row="workdayName"]').hidden = !workdayName;
  setPrintValue("clientName", clientName || "-");
  document.querySelector('[data-print-row="clientName"]').hidden = !clientName;
  setPrintValue("date", date || "Niet ingevuld");
  setPrintValue("times", startTime && endTime
    ? `${startTime} tot ${endTime}${result.endsNextDay ? " (volgende dag)" : ""}`
    : "Niet ingevuld");
  setPrintValue("breakMinutes", result.breakMinutes ? `${result.breakMinutes} minuten` : "-");
  document.querySelector('[data-print-row="break"]').hidden = !result.breakMinutes;
  setPrintValue("totalHours", formatHours(result.totalHours));
  setPrintValue("subtotalExVat", euroFormatter.format(result.subtotalExVat));
  setPrintValue("vatAmount", euroFormatter.format(result.vatAmount));
  setPrintValue("totalIncVat", euroFormatter.format(result.totalIncVat));

  lines.replaceChildren();
  addPrintCalculationLine(lines,
    result.isTravelDay
      ? `Reisdag · ${result.travelRegion === "outside_europe" ? "Buiten Europa" : "Binnen Europa"}`
      : result.rateMode === "hour"
      ? (result.minimumChargeApplied ? "Minimale afname" : "Gewerkte uren")
      : (usesHalfDayRate ? "Halve dagvergoeding" : "Minimale dagvergoeding"),
    result.isTravelDay
      ? `${numberFormatter.format(result.travelPercent)}% van ${euroFormatter.format(result.settings.dayRate)}`
      : result.rateMode === "hour"
      ? `${numberFormatter.format(result.regularHours)} uur × ${euroFormatter.format(result.hourlyRate)}${result.minimumChargeApplied ? ` + ${euroFormatter.format(result.minimumAdjustmentAmount)} minimumcorrectie tot ${numberFormatter.format(result.minimumHours)} uur` : ""}`
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
    `Pure nachturen tegen ${numberFormatter.format(nightSurchargeToTotalPercent(result.settings.nightSurchargePercent))}%`,
    `${formatCalculation(result.pureNightHours, result.hourlyRate, result.settings.pureNightSurchargeFactor)} extra (totaal ${numberFormatter.format(nightSurchargeToTotalPercent(result.settings.nightSurchargePercent))}% per nachtuur)`,
    result.pureNightAmount
  );
  result.nightOvertimeSurchargeBreakdown.forEach((item) => {
    addPrintCalculationLine(
      lines,
      `Nachturen tijdens overuren tegen ${numberFormatter.format(nightSurchargeToTotalPercent(result.settings.nightSurchargePercent))}%`,
      `${formatCalculation(item.hours, result.hourlyRate, item.surchargeFactor)} nachttoeslag op dit specifieke overuur (overuurvergoeding staat hierboven)`,
      item.amount
    );
  });
  addPrintCalculationLine(lines, "Drone tarief", "Vaste toeslag", result.droneTariffAmount);
  addPrintCalculationLine(lines, "Ronin 4D tarief", "Vaste toeslag", result.ronin4dTariffAmount);
  result.customEquipmentItems.forEach((item) => {
    addPrintCalculationLine(
      lines,
      item.name,
      item.amount < 0 ? "Correctie op het dagtarief" : "Vaste apparatuurtoeslag",
      item.amount
    );
  });
  addPrintCalculationLine(
    lines,
    "Kilometervergoeding",
    `${numberFormatter.format(result.kilometers)} km × ${euroFormatter.format(result.settings.kilometerRate)}`,
    result.kilometerAmount
  );
  addPrintCalculationLine(lines, "Parkeer/onkosten", "Ingevoerde onkosten", result.parkingAmount);
  document.querySelector(".print-breakdown")?.classList.toggle(
    "is-dense",
    lines.childElementCount > 9
  );
}

function buildSummary(result) {
  const workdayName = String(form.elements.namedItem("workdayName")?.value || "").trim();
  const date = form.elements.namedItem("date").value;
  const startTime = form.elements.namedItem("startTime").value;
  const endTime = form.elements.namedItem("endTime").value;
  const lines = [];

  if (workdayName) {
    lines.push(`Werkdag: ${workdayName}`);
  }

  if (date) {
    lines.push(`Datum: ${formatInvoiceDate(date)}`);
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

async function syncFreeSharedWorkdaySource() {
  if (
    !currentShareWorkdayId
    || !currentAccountUser
    || currentUserContext?.isPro
    || currentSharedSource
    || currentProjectDayContext
  ) return;

  await persistFreeActiveWorkday(buildWorkdaySnapshot(), { showToast: false });
}

function calculationValidationFields(settings, formData) {
  const fields = [form.elements.namedItem("startTime")];
  if (settings.rateMode === "hour") {
    fields.push(
      settingsForm.elements.namedItem("hourlyRate"),
      settingsForm.elements.namedItem("minimumHours")
    );
  } else {
    fields.push(
      settingsForm.elements.namedItem("dayRate"),
      settingsForm.elements.namedItem("normalDayHours")
    );
  }
  if (settings.enableNightTariff) {
    fields.push(
      settingsForm.elements.namedItem("nightSurchargePercent"),
      settingsForm.elements.namedItem("nightStart"),
      settingsForm.elements.namedItem("nightEnd")
    );
  }
  if (readCheckbox(formData, "enableKilometers")) {
    fields.push(
      form.elements.namedItem("kilometers"),
      settingsForm.elements.namedItem("kilometerRate")
    );
  }
  if (readCheckbox(formData, "enableParkingCosts")) {
    fields.push(form.elements.namedItem("parkingCosts"));
  }
  return fields.filter((field) => field instanceof HTMLElement);
}

function validateCalculationInputs(settings, formData) {
  const invalidField = calculationValidationFields(settings, formData)
    .find((field) => typeof field.checkValidity === "function" && !field.checkValidity());
  if (!invalidField) return true;

  const settingsDetails = invalidField.closest("details");
  if (settingsDetails) settingsDetails.open = true;
  const label = invalidField.closest("label")?.querySelector("span")?.textContent?.trim();
  sessionUi?.showToast(label
    ? `Controleer het veld ${label.toLowerCase()}.`
    : "Controleer de gemarkeerde invoer.");
  requestAnimationFrame(() => invalidField.reportValidity?.());
  return false;
}

function updateCalculation(trackCompletion = false) {
  const endTimeField = form.elements.namedItem("endTime");
  const settings = getSettingsFromForm();
  const formData = new FormData(form);
  const isTravelDay = readCheckbox(formData, "enableTravelDay");

  if (!validateCalculationInputs(settings, formData)) return;
  if (!endTimeField.value && !isTravelDay) {
    clearCalculationDisplay();
    if (trackCompletion) sessionUi?.showToast("Vul eerst de eindtijd in om te berekenen.");
    return;
  }

  const department = formData.get("department");

  let result;
  try {
    result = calculateTariff(
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
        parkingCosts: readNumber(formData, "parkingCosts"),
        enableTravelDay: readCheckbox(formData, "enableTravelDay"),
        travelRegion: formData.get("travelRegion") || "within_europe",
        travelPercent: formData.get("travelRegion") === "outside_europe"
          ? settings.travelOutsideEuropePercent
          : settings.travelWithinEuropePercent
      },
      settings
    );
  } catch (error) {
    console.warn("Berekening kon niet worden uitgevoerd.", error);
    clearCalculationDisplay();
    sessionUi?.showToast(error.message || "De werkdag kon niet worden berekend.");
    return;
  }

  setResult("totalHours", result.totalHours);
  setResult("overtimeHours", result.overtimeHours);
  setResult("overtime10To12Hours", result.overtime10To12Hours);
  setResult("overtimeFrom12Hours", result.overtimeFrom12Hours);
  setResult("overtimeFrom14Hours", result.overtimeFrom14Hours);
  setResult("nightHours", result.nightHours);
  setResult("nightOvertimeHours", result.nightOvertimeHours);
  setResult("pureNightHours", result.pureNightHours);
  setResult("baseAmount", result.baseAmount, formatEuro);
  document.querySelector("[data-base-result]").hidden = Boolean(result.isTravelDay);
  setResult("travelDayAmount", result.travelDayAmount, formatEuro);
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
  if (travelResultRow) travelResultRow.hidden = !result.isTravelDay;

  nextDayNotice.hidden = !result.endsNextDay;
  form.dataset.summary = buildSummary(result);
  latestResult = result;
  renderPrintBreakdown(result);
  calculationIsStale = false;
  calculationStatus.hidden = true;

  if (trackCompletion) {
    void trackBadgeActivity("calculator_calculated", currentWorkdayId || currentProjectDayContext?.day?.id || null, {
      shared: Boolean(currentSharedSource),
      travelDay: result.isTravelDay
    });
    void syncFreeSharedWorkdaySource().catch((error) => {
      console.warn("Gedeelde Free-werkdag bijwerken is mislukt.", error);
    });
    void rememberCurrentClient().catch((error) => {
      console.warn("Opdrachtgever automatisch opslaan is mislukt.", error);
    });
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

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function stopLiveWorkdayAndCalculate() {
  const endTimeField = form.elements.namedItem("endTime");
  if (currentProjectDayContext && !endTimeField.value) {
    liveWorkdayArmed = true;
  }
  const endTimeIsFixed = endTimeField.dataset.timePicked === "true"
    || endTimeField.dataset.timeRestored === "true";
  const liveState = !endTimeIsFixed && liveWorkday
    ? liveWorkday.getState(readLiveWorkdayState())
    : null;

  if (!liveState?.active) {
    updateCalculation(true);
    return;
  }

  const timeControl = endTimeField.closest(".time-control");
  const roundedEndTime = liveWorkday.roundedCurrentTime();
  recalculateButton.disabled = true;
  liveWorkdayController?.stop();
  timeControl?.classList.add("is-stopping");
  liveWorkdayStatus?.classList.add("is-stopping");

  await wait(260);
  endTimeField.value = roundedEndTime;
  endTimeField.dataset.timePicked = "true";
  endTimeField.dataset.liveStopped = "true";
  liveWorkdayArmed = false;
  delete endTimeField.dataset.timeRestored;
  delete endTimeField.dataset.liveCalculated;
  liveEndTimecode.textContent = roundedEndTime;
  timeControl?.classList.add("is-settled");

  await wait(420);
  timeControl?.classList.remove("is-live", "is-stopping", "is-settled");
  liveWorkdayStatus?.classList.remove("is-stopping");
  liveWorkdayStatus.hidden = true;
  liveEndTimecode.hidden = true;
  resumeLiveWorkdayButton.hidden = false;
  recalculateButton.disabled = false;
  liveWorkdayController?.update();
  updateCalculation(true);
  sessionUi?.showToast(`Werkdag gestopt om ${roundedEndTime}.`);
}

function activateLiveWorkday() {
  const endTimeField = form.elements.namedItem("endTime");
  endTimeField.value = "";
  delete endTimeField.dataset.timePicked;
  delete endTimeField.dataset.timeRestored;
  delete endTimeField.dataset.liveStopped;
  delete endTimeField.dataset.liveCalculated;
  liveWorkdayArmed = true;
  resumeLiveWorkdayButton.hidden = true;
  clearCalculationDisplay();
  liveWorkdayController?.update();
  sessionUi?.showToast("Live tijd hervat.");
}

async function resumeLiveWorkday() {
  if (persistedWorkdayEndTime && await hasAcceptedSharedRecipients()) {
    openNativeDialog(sharedResumeDialog);
    return;
  }
  activateLiveWorkday();
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
  settingsForm.querySelector('[data-rate-setting="day-hours"]').hidden = rateMode === "hour";
  settingsForm.querySelector('[data-rate-setting="minimum-hours"]').hidden = rateMode !== "hour";
  settingsForm.querySelector(".half-day-setting").hidden = rateMode === "hour";
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

function updateTravelVisibility() {
  const enabled = Boolean(form.elements.namedItem("enableTravelDay")?.checked);
  if (travelRegionInput) travelRegionInput.hidden = !enabled;
  if (travelResultRow) travelResultRow.hidden = !enabled;
  const startTime = form.elements.namedItem("startTime");
  const endTime = form.elements.namedItem("endTime");
  if (startTime) startTime.required = !enabled;
  if (endTime) endTime.required = !enabled;
}

function updateDepartmentVisibility() {
  const department = form.elements.namedItem("department").value || "camera";
  const isPro = Boolean(currentUserContext?.isPro);
  const showDrone = isPro ? Boolean(accountEquipmentVisibility?.drone) : true;
  const showRonin = department === "camera" && (isPro ? Boolean(accountEquipmentVisibility?.ronin) : true);
  const droneCheckbox = form.elements.namedItem("enableDroneTariff");
  const roninCheckbox = form.elements.namedItem("enableRonin4dTariff");
  const travelCheckbox = form.elements.namedItem("enableTravelDay");

  inputOptions.dataset.department = department;
  droneOption.hidden = !showDrone;
  droneResultRow.hidden = !showDrone;
  roninOption.hidden = !showRonin;
  roninResultRow.hidden = !showRonin;
  [droneOption, roninOption, travelOption].filter(Boolean).forEach((option) => option.classList.toggle("is-pro-locked", !isPro));
  [droneOption, roninOption, travelOption].filter(Boolean).forEach((option) => {
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
  [droneCheckbox, roninCheckbox, travelCheckbox].filter(Boolean).forEach((checkbox) => { checkbox.disabled = !isPro; });
  document.querySelectorAll(".pro-option-badge").forEach((badge) => { badge.hidden = isPro; });
  if (!isPro) {
    if (droneCheckbox) droneCheckbox.checked = false;
    if (roninCheckbox) roninCheckbox.checked = false;
    if (travelCheckbox) travelCheckbox.checked = false;
  }

  if (!showDrone && droneCheckbox) {
    droneCheckbox.checked = false;
    setResult("droneTariffAmount", 0, formatEuro);
  }

  if (!showRonin && roninCheckbox) {
    roninCheckbox.checked = false;
    setResult("ronin4dTariffAmount", 0, formatEuro);
  }
  updateTravelVisibility();
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
    enableParkingCosts: "parking_enabled",
    enableTravelDay: "travel_day_enabled"
  };
  const eventName = eventByField[target.name];
  if (eventName) analytics?.track(eventName, { department });
}

function readLiveWorkdayState() {
  const settings = getSettingsFromForm();
  const endTimeField = form.elements.namedItem("endTime");
  const endTimeIsFixed = endTimeField.dataset.timePicked === "true"
    || endTimeField.dataset.timeRestored === "true";
  return {
    armed: liveWorkdayArmed,
    date: form.elements.namedItem("date").value,
    startTime: form.elements.namedItem("startTime").value,
    endTime: currentSharedSource
      ? endTimeField.value
      : (endTimeIsFixed ? endTimeField.value : ""),
    breakMinutes: settings.breakMinutes,
    normalDayHours: settings.normalDayHours,
    enableNightTariff: settings.enableNightTariff,
    nightStart: settings.nightStart
  };
}

function updateResumeLiveAccess() {
  if (!resumeLiveWorkdayButton || !liveWorkday) return;
  if (currentSharedSource) {
    resumeLiveWorkdayButton.hidden = true;
    return;
  }
  const endTimeField = form.elements.namedItem("endTime");
  const hasFixedEndTime = Boolean(endTimeField.value)
    && (endTimeField.dataset.timePicked === "true"
      || endTimeField.dataset.timeRestored === "true"
      || endTimeField.dataset.liveStopped === "true");
  const liveCandidate = liveWorkday.getState({
    ...readLiveWorkdayState(),
    armed: true,
    endTime: ""
  });
  resumeLiveWorkdayButton.hidden = !(hasFixedEndTime && liveCandidate.active);
}

function renderLiveWorkday(state) {
  if (!liveWorkdayStatus || !liveWorkdayDuration) return;
  liveWorkdayStatus.hidden = !state.active;
  liveEndTimecode.hidden = !state.active;
  liveEndTimecode.closest(".time-control")?.classList.toggle("is-live", state.active);
  if (!state.active) {
    updateResumeLiveAccess();
    return;
  }
  resumeLiveWorkdayButton.hidden = true;
  liveWorkdayDuration.textContent = state.label;
  liveEndTimecode.textContent = state.timecode;
  if (enableWorkdayNotifications && workdayNotificationController) {
    enableWorkdayNotifications.hidden = workdayNotificationController.permission() !== "default";
  }
}

function initializeLiveWorkday() {
  if (!liveWorkday || !liveWorkdayStatus) return;
  workdayNotificationController = workdayNotifications?.createController({
    read: () => ({ ...readLiveWorkdayState(), active: !liveWorkdayStatus.hidden }),
    onReminder: (reminder) => sessionUi?.showToast(reminder.title)
  }) || null;
  liveWorkdayController = liveWorkday.createController({
    read: readLiveWorkdayState,
    render: renderLiveWorkday,
    onTick: () => workdayNotificationController?.check()
  });
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
updateTravelVisibility();
initializeLiveWorkday();

form.addEventListener("input", () => {
  markCalculationStale();
  liveWorkdayController?.update();
  updateResumeLiveAccess();
});
form.addEventListener("click", (event) => {
  if (currentUserContext?.isPro) return;
  if (event.target.closest("#drone-option, #ronin-option, #travel-option")) {
    event.preventDefault();
    sessionUi?.openUpgrade();
  }
});
form.addEventListener("keydown", (event) => {
  if (currentUserContext?.isPro || !["Enter", " "].includes(event.key)) return;
  if (event.target.closest("#drone-option, #ronin-option, #travel-option")) {
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
  if (
    event.target.name === "startTime"
    && event.target.dataset.timePicked === "true"
  ) {
    liveWorkdayArmed = true;
  }
  trackOptionChange(event.target);
  updateDepartmentVisibility();
  updateKilometerVisibility();
  updateParkingVisibility();
  markCalculationStale();
  if (["department", "enableDroneTariff", "enableRonin4dTariff"].includes(event.target.name)) {
    scheduleAccountSettingsSync();
  }
  scheduleActiveWorkFunctionSync();
  if (event.target.name === "date") updateWorkdaySaveAccess();
  liveWorkdayController?.update();
  updateResumeLiveAccess();
});
settingsForm.addEventListener("input", (event) => {
  markCalculationStale();
  updateGuestExplanationLink(getSettingsFromForm());
  if (["dayRate", "hourlyRate", "normalDayHours", "minimumHours", "kilometerRate"].includes(event.target.name)) scheduleAccountSettingsSync();
  scheduleActiveWorkFunctionSync();
});
settingsForm.addEventListener("change", () => {
  updateNightSettingsVisibility();
  updateRateSettingsVisibility();
  updatePauseVisibility();
  markCalculationStale();
  updateGuestExplanationLink(getSettingsFromForm());
  scheduleAccountSettingsSync();
  scheduleActiveWorkFunctionSync();
  liveWorkdayController?.update();
});
function requestCalculation() {
  if (currentSharedSource && !currentSharedSourceEndTime && !sharedReceiverCalculatedEarly) {
    openNativeDialog(unfinishedSharedWorkdayDialog);
    return;
  }
  stopLiveWorkdayAndCalculate();
}

async function resumeSharedWorkday() {
  if (!currentSharedSource) return;
  sharedReceiverCalculatedEarly = false;
  sharedTimeOverrides.delete("endTime");
  const endTimeField = form.elements.namedItem("endTime");
  endTimeField.value = "";
  delete endTimeField.dataset.timePicked;
  delete endTimeField.dataset.timeRestored;
  delete endTimeField.dataset.liveStopped;
  delete endTimeField.dataset.liveCalculated;
  clearCalculationDisplay();
  updateSharedReceiverMode();
  await refreshSharedReceiverTimes();
  liveWorkdayController?.update();
  updateResumeLiveAccess();
  sessionUi?.showToast(
    currentSharedSourceEndTime
      ? "De definitieve gedeelde tijden zijn bijgewerkt."
      : "Je doet weer mee met de gedeelde werkdag."
  );
}

recalculateButton.addEventListener("click", requestCalculation);
resumeLiveWorkdayButton?.addEventListener("click", resumeLiveWorkday);
resumeSharedWorkdayButton?.addEventListener("click", resumeSharedWorkday);
confirmSharedCalculationButton?.addEventListener("click", () => {
  sharedReceiverCalculatedEarly = true;
  closeNativeDialog(unfinishedSharedWorkdayDialog);
  updateSharedReceiverMode();
  stopLiveWorkdayAndCalculate();
});
document.querySelectorAll("[data-shared-calculation-cancel]").forEach((button) => {
  button.addEventListener("click", () => closeNativeDialog(unfinishedSharedWorkdayDialog));
});
workdaySaveButton?.addEventListener("click", () => saveWorkday());

async function openCurrentWorkdayShare() {
  if (!currentAccountUser) {
    sessionUi?.openAuth("register", { purpose: "workday-sharing" });
    return;
  }
  if (shareFromParticipantsButton) shareFromParticipantsButton.disabled = true;
  try {
    const projectDayId = currentProjectDayContext?.day?.id;
    let sourceType = projectDayId ? "project_day" : "workday";
    let sourceId = projectDayId || currentWorkdayId;
    if (sourceType === "project_day" && !currentUserContext?.isPro) {
      sessionUi?.openUpgrade();
      return;
    }
    if (!sourceId && sourceType === "workday") {
      const snapshot = buildWorkdaySnapshot();
      if (currentUserContext?.isPro) {
        const saved = await persistWorkday(snapshot);
        sourceId = saved?.id;
      } else {
        const saved = await persistFreeActiveWorkday(snapshot, { showToast: false });
        sourceId = saved?.sourceId;
      }
    } else if (
      sourceType === "workday"
      && !currentUserContext?.isPro
      && currentShareWorkdayId
    ) {
      const snapshot = buildWorkdaySnapshot();
      const saved = await persistFreeActiveWorkday(snapshot, { showToast: false });
      sourceId = saved?.sourceId;
    }
    if (sourceId) await shareUi?.open({ sourceType, sourceId });
  } catch (error) {
    console.warn("Werkdag delen is mislukt.", error);
    sessionUi?.showToast(error.message || "De werkdag kon niet worden klaargezet om te delen.");
  } finally {
    updateWorkdaySaveAccess();
  }
}

shareFromParticipantsButton?.addEventListener("click", openCurrentWorkdayShare);
currentWorkdayParticipantList?.addEventListener("click", (event) => {
  const preview = event.target.closest("[data-crew-preview-id]");
  if (preview?.dataset.crewPreviewId) {
    const profile = participantDemoProfiles.find((item) => item.userId === preview.dataset.crewPreviewId);
    if (profile) globalThis.OveruurtjeCrewCards?.openPreview?.(profile.crewCard);
    return;
  }
  const participant = event.target.closest("[data-crew-user-id]");
  if (!participant?.dataset.crewUserId) return;
  globalThis.OveruurtjeCrewCards?.open?.(participant.dataset.crewUserId);
});
if (participantDevToggle) {
  participantDevToggle.hidden = !canDemoParticipants();
  participantDevToggle.classList.toggle("is-active", participantDemoEnabled());
  participantDevToggle.textContent = participantDemoEnabled() ? "Demo aan" : "Demo crew";
  participantDevToggle.addEventListener("click", () => {
    const enabled = !participantDemoEnabled();
    localStorage.setItem(PARTICIPANT_DEMO_KEY, enabled ? "1" : "0");
    participantDevToggle.classList.toggle("is-active", enabled);
    participantDevToggle.textContent = enabled ? "Demo aan" : "Demo crew";
    renderCurrentWorkdayParticipants();
  });
}
function toggleSharedTimeOverride(fieldName) {
  if (!currentSharedSource) return;
  const label = fieldName === "startTime" ? "Starttijd" : "Eindtijd";
  if (sharedTimeOverrides.has(fieldName)) {
    sharedTimeOverrides.delete(fieldName);
    sessionUi?.showToast(`${label} weer vergrendeld.`);
  } else {
    sharedTimeOverrides.add(fieldName);
    sessionUi?.showToast(`${label} ontgrendeld.`);
  }
  updateSharedReceiverMode();
}
sharedStartTimeLockButton?.addEventListener("click", () => toggleSharedTimeOverride("startTime"));
sharedEndTimeLockButton?.addEventListener("click", () => toggleSharedTimeOverride("endTime"));
document.addEventListener("overuurtje:shares-changed", refreshCurrentWorkdayParticipants);
window.addEventListener("focus", () => {
  refreshCurrentWorkdayParticipants();
  refreshSharedReceiverTimes({ announce: true });
});
enableWorkdayNotifications?.addEventListener("click", async () => {
  const permission = await workdayNotificationController?.requestPermission();
  if (permission === "granted") sessionUi?.showToast("Werkdagmeldingen staan aan zolang Overuurtje actief is.");
  else if (permission === "denied") sessionUi?.showToast("Meldingen zijn geblokkeerd in je browserinstellingen.");
  else if (permission === "unsupported") sessionUi?.showToast("Deze browser ondersteunt geen systeemmeldingen.");
  liveWorkdayController?.update();
});
document.querySelector("#open-existing-workday")?.addEventListener("click", () => {
  if (pendingDuplicateWorkday?.existing) openExistingDateEntry(pendingDuplicateWorkday.existing);
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
  if (todayWorkday) openExistingDateEntry(todayWorkday);
  hideActiveSharedReminder();
  todayWorkday = null;
  closeNativeDialog(todayWorkdayDialog);
});
document.querySelector("#new-today-calculation")?.addEventListener("click", () => {
  if (todayWorkday?.kind === "shared") {
    showActiveSharedReminder(todayWorkday.share);
  }
  if (todayWorkday?.kind === "free-active" && currentAccountUser) {
    freeActiveWorkdayService.clear(currentAccountUser.id);
    currentShareWorkdayId = null;
  }
  todayWorkday = null;
  closeNativeDialog(todayWorkdayDialog);
});
document.querySelector("#new-calculation")?.addEventListener("click", () => {
  // This opens one clean calculation. On the next visit to Vandaag an active
  // accepted shared workday again takes precedence.
});
document.querySelectorAll("[data-workday-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = button.closest("dialog");
    if (dialog === todayWorkdayDialog && todayWorkday?.kind === "shared") {
      showActiveSharedReminder(todayWorkday.share);
    }
    closeNativeDialog(dialog);
  });
});
openActiveSharedButton?.addEventListener("click", () => {
  if (!activeSharedWorkday?.id) return;
  location.href = `index.html?shared=${encodeURIComponent(activeSharedWorkday.id)}`;
});

confirmSharedCompletionButton?.addEventListener("click", async () => {
  const pending = pendingSharedCompletionSave;
  pendingSharedCompletionSave = null;
  closeNativeDialog(sharedCompletionDialog);
  if (pending) await saveWorkday({ ...pending, skipCompletionConfirmation: true });
});
document.querySelectorAll("[data-shared-completion-cancel]").forEach((button) => {
  button.addEventListener("click", () => {
    pendingSharedCompletionSave = null;
    closeNativeDialog(sharedCompletionDialog);
  });
});
confirmSharedResumeButton?.addEventListener("click", async () => {
  closeNativeDialog(sharedResumeDialog);
  activateLiveWorkday();
  await saveWorkday({ skipCompletionConfirmation: true });
});
document.querySelectorAll("[data-shared-resume-cancel]").forEach((button) => {
  button.addEventListener("click", () => closeNativeDialog(sharedResumeDialog));
});
copyButton.addEventListener("click", copySummary);
moneybirdExportButton?.addEventListener("click", () => {
  globalThis.OveruurtjeFeatureGate.require("accounting_export", currentUserContext, () => {
    try {
      if (!latestResult || calculationIsStale || !form.elements.namedItem("endTime").value) {
        throw new Error("Bereken en rond de werkdag eerst af.");
      }
      if (currentProjectDayContext?.project?.id && currentProjectDayContext?.day?.id) {
        const day = {
          ...currentProjectDayContext.day,
          calculationData: buildWorkdaySnapshot()
        };
        accountingUi.open({
          exportModel: accountingExport.fromProject(currentProjectDayContext.project, [day]),
          context: currentUserContext
        });
        return;
      }
      if (!currentWorkdayId) throw new Error("Sla deze werkdag eerst op voordat je hem naar je boekhoudsysteem stuurt.");
      accountingUi.open({
        exportModel: accountingExport.fromWorkday({
          id: currentWorkdayId,
          workDate: form.elements.namedItem("date").value,
          calculationData: buildWorkdaySnapshot()
        }),
        context: currentUserContext
      });
    } catch (error) {
      sessionUi?.showToast(error.message || "De boekhoudpreview kon niet worden geopend.");
    }
  });
});
saveSettingsButton.addEventListener("click", saveCurrentSettings);
pdfButton.addEventListener("click", () => {
  globalThis.OveruurtjeFeatureGate.require("pdf_export", currentUserContext, () => {
    void trackBadgeActivity("pdf_generated", currentWorkdayId || currentProjectDayContext?.day?.id || null);
    window.print();
  });
});
optionsToggle?.addEventListener("click", () => {
  const expanded = optionsToggle.getAttribute("aria-expanded") === "true";
  optionsToggle.setAttribute("aria-expanded", String(!expanded));
  inputOptions.hidden = expanded;
  optionsToggle.closest(".options-section")?.classList.toggle("is-open", !expanded);
});

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
document.addEventListener("overuurtje:accounting-connection", (event) => {
  if (event.detail) applyAccountingExportState(event.detail);
  else void updateAccountingExportVisibility(currentUserContext);
});
sessionUi?.ready.then(hydrateAccountSettings);
