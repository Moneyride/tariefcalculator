(function initializeAccountPage() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const auth = globalThis.OveruurtjeAuth;
  const settingsService = globalThis.OveruurtjeSettings;
  const functionService = globalThis.OveruurtjeFunctions;
  const equipmentService = globalThis.OveruurtjeEquipment;
  const profileService = globalThis.OveruurtjeProfiles;
  const subscriptions = globalThis.OveruurtjeSubscriptions;
  const unavailable = document.querySelector("#account-unavailable");
  const loggedOut = document.querySelector("#account-logged-out");
  const content = document.querySelector("#account-content");
  const email = document.querySelector("#account-email");
  const created = document.querySelector("#account-created");
  const planPill = document.querySelector("#account-plan-pill");
  const subscriptionPeriod = document.querySelector("#account-subscription-period");
  const subscriptionPeriodLabel = document.querySelector("#account-subscription-period-label");
  const subscriptionPeriodValue = document.querySelector("#account-subscription-period-value");
  const subscriptionStopButton = document.querySelector("#account-subscription-stop");
  const settingsForm = document.querySelector("#account-settings-form");
  const settingsStatus = document.querySelector("#account-settings-status");
  const passwordForm = document.querySelector("#password-form");
  const passwordStatus = document.querySelector("#password-status");
  const mfaAction = document.querySelector("#account-mfa-action");
  const mfaStatus = document.querySelector("#account-mfa-status");
  const profileNameForm = document.querySelector("#profile-name-form");
  const profileNameStatus = document.querySelector("#profile-name-status");
  const planTitle = document.querySelector("#subscription-plan-title");
  const planDescription = document.querySelector("#subscription-plan-description");
  const upgradeButton = document.querySelector(".subscription-actions [data-subscription-upgrade]");
  const manageButton = document.querySelector(".subscription-section [data-subscription-manage]");
  const freePlanOption = document.querySelector('[data-plan-option="free"]');
  const proPlanOption = document.querySelector('[data-plan-option="pro"]');
  const freePlanState = document.querySelector("[data-free-plan-state]");
  const proPlanState = document.querySelector("[data-pro-plan-state]");
  const monthlyPrice = document.querySelector("#subscription-monthly-price");
  const monthlyPriceLine = document.querySelector("#subscription-monthly-price-line");
  const monthlyPriceUnit = document.querySelector("#subscription-monthly-price-unit");
  const yearlyPrice = document.querySelector("#subscription-yearly-price");
  const yearlyRegular = document.querySelector("#subscription-yearly-regular");
  const yearlySaving = document.querySelector("#subscription-yearly-saving");
  const yearlySavingText = document.querySelector("#subscription-yearly-saving-text");
  const subscriptionManagementCopy = document.querySelector("#subscription-management-copy");
  const mockControl = document.querySelector("#mock-plan-control");
  const mockPlan = document.querySelector("#mock-plan");
  const roninRow = document.querySelector("#account-ronin-row");
  const compactFunctionSetting = document.querySelector("#compact-function-setting");
  const functionSelect = document.querySelector("#account-function-select");
  const removeFunctionButton = document.querySelector("#remove-function-button");
  const defaultDayRateLabel = document.querySelector("#default-day-rate-label");
  const addFunctionButton = document.querySelector("#add-function-button");
  const addFunctionForm = document.querySelector("#add-function-form");
  const newFunctionName = document.querySelector("#new-function-name");
  const equipmentSection = document.querySelector("#account-equipment-section");
  const proPreviewSection = document.querySelector(".pro-preview-section");
  const proFeaturesTitle = document.querySelector("#pro-features-title");
  const equipmentList = document.querySelector("#custom-equipment-account-list");
  const addEquipmentButton = document.querySelector("#add-equipment-button");
  const addEquipmentForm = document.querySelector("#add-equipment-form");
  const newEquipmentName = document.querySelector("#new-equipment-name");
  const newEquipmentAmount = document.querySelector("#new-equipment-amount");
  const accountClientName = document.querySelector("#account-client-name");
  const accountAddClient = document.querySelector("#account-add-client");
  const accountClientList = document.querySelector("#account-client-list");
  const accountClientStatus = document.querySelector("#account-client-status");
  const accountEnableNotifications = document.querySelector("#account-enable-notifications");
  const accountNotificationStatus = document.querySelector("#account-notification-status");
  const profileAvatarInput = document.querySelector("#profile-avatar-input");
  const profileAvatarPreview = document.querySelector("#profile-avatar-preview");
  const profileAvatarFallback = document.querySelector("#profile-avatar-fallback");
  const profileAvatarStatus = document.querySelector("#profile-avatar-status");
  const avatarCropper = globalThis.OveruurtjeAvatarCropper?.create({
    dialog: document.querySelector("#avatar-crop-dialog"),
    canvas: document.querySelector("#avatar-crop-canvas"),
    zoomInput: document.querySelector("#avatar-crop-zoom"),
    confirmButton: document.querySelector("#avatar-crop-confirm"),
    closeButtons: document.querySelectorAll("[data-avatar-crop-close]")
  });
  const pushService = globalThis.OveruurtjePush;
  let currentContext = null;
  let loadedSettings = settingsService.defaults;
  let workFunctions = [];
  let customEquipment = [];
  let displayedFunctionId = null;
  let verifiedMfaFactor = null;
  let pendingMfaFactorId = null;
  const fallbackShopifyPricing = Object.freeze({
    currency: "EUR",
    monthly: { amountCents: 299 },
    yearly: { amountCents: 2999 },
    regularYearAmountCents: 3588,
    savingsAmountCents: 589,
    savingsMonths: 2,
    source: "fallback"
  });

  function formatShopifyMoney(cents, currency = "EUR") {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      minimumFractionDigits: 2
    }).format(Number(cents || 0) / 100);
  }

  function renderShopifyPricing(pricing) {
    const currency = pricing.currency || "EUR";
    const monthlyCents = pricing.monthly?.amountCents ?? pricing.monthly?.amount;
    const yearlyCents = pricing.yearly?.amountCents ?? pricing.yearly?.amount;
    const regularYearCents = pricing.regularYearAmountCents ?? pricing.regularYearAmount;
    const savingsCents = pricing.savingsAmountCents ?? pricing.savingsAmount;
    const savingsMonths = Number(pricing.savingsMonths || 0);
    monthlyPrice.textContent = formatShopifyMoney(monthlyCents, currency);
    monthlyPriceLine.classList.remove("is-price-fallback");
    monthlyPriceUnit.hidden = false;
    monthlyPriceUnit.textContent = "per maand excl. btw";
    yearlyPrice.textContent = `${formatShopifyMoney(yearlyCents, currency)} per jaar excl. btw`;
    yearlyRegular.textContent = formatShopifyMoney(regularYearCents, currency);
    yearlySavingText.textContent = savingsMonths > 0
      ? `${savingsMonths} maanden gratis`
      : `bespaar ${formatShopifyMoney(savingsCents, currency)}`;
    yearlySaving.hidden = Number(savingsCents || 0) <= 0;
  }

  async function loadShopifyPricing() {
    try {
      const response = await fetch("/api/shopify/pricing", {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("Prijsservice niet beschikbaar");
      renderShopifyPricing(await response.json());
    } catch (error) {
      console.warn("Actuele Shopify-prijzen konden niet worden geladen.", error);
      renderShopifyPricing(fallbackShopifyPricing);
    }
  }

  async function renderMfaStatus() {
    if (!currentContext?.auth.user || !mfaAction) return;
    try {
      const { data, error } = await auth.listMfaFactors();
      if (error) throw error;
      verifiedMfaFactor = data?.totp?.find((item) => item.status === "verified") || null;
      mfaAction.textContent = verifiedMfaFactor ? "Uitschakelen" : "Instellen";
      mfaStatus.textContent = verifiedMfaFactor
        ? "Tweestapsverificatie is actief."
        : "Tweestapsverificatie is nog niet actief.";
    } catch (error) {
      mfaStatus.textContent = error.message || "De beveiligingsstatus kon niet worden geladen.";
    }
  }

  function ensureMfaEnrollmentDialog() {
    let dialog = document.querySelector("#mfa-enrollment-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog mfa-enrollment-dialog";
    dialog.id = "mfa-enrollment-dialog";
    dialog.innerHTML = `
      <button class="dialog-close" type="button" aria-label="Sluiten">&times;</button>
      <p class="dialog-eyebrow">Tweestapsverificatie</p>
      <h2>Authenticator koppelen</h2>
      <p>Scan de QR-code met Google Authenticator, Microsoft Authenticator, 1Password of een vergelijkbare app.</p>
      <img class="mfa-qr-code" alt="QR-code voor authenticator-app">
      <code class="mfa-secret"></code>
      <form>
        <input class="mfa-code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" aria-label="Verificatiecode" required>
        <p class="saas-form-status" aria-live="polite"></p>
        <button class="saas-primary-button" type="submit">Activeren</button>
      </form>
    `;
    document.body.append(dialog);
    const close = async () => {
      if (pendingMfaFactorId) {
        await auth.unenrollMfa(pendingMfaFactorId).catch(() => {});
        pendingMfaFactorId = null;
      }
      dialog.close();
    };
    dialog.querySelector(".dialog-close").addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    return dialog;
  }

  async function startMfaEnrollment() {
    mfaStatus.textContent = "Authenticator voorbereiden…";
    const response = await auth.enrollMfa();
    if (response.error) throw response.error;
    const factor = response.data;
    pendingMfaFactorId = factor.id;
    const dialog = ensureMfaEnrollmentDialog();
    const form = dialog.querySelector("form");
    dialog.querySelector(".mfa-qr-code").src = factor.totp.qr_code;
    dialog.querySelector(".mfa-secret").textContent = `Handmatige code: ${factor.totp.secret}`;
    form.reset();
    form.querySelector(".saas-form-status").textContent = "";
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const status = form.querySelector(".saas-form-status");
      status.textContent = "Controleren…";
      const verified = await auth.verifyMfa(factor.id, form.elements.namedItem("code").value);
      if (verified.error) {
        status.textContent = "De code klopt niet of is verlopen.";
        return;
      }
      pendingMfaFactorId = null;
      dialog.close();
      mfaStatus.textContent = "Tweestapsverificatie is geactiveerd.";
      await renderMfaStatus();
    };
    dialog.showModal();
    form.elements.namedItem("code").focus();
  }

  function setVisible(element, visible) {
    element.hidden = !visible;
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value));
  }

  function nightSurchargeToTotalPercent(value) {
    return 100 + Math.max(0, Number(value) || 0);
  }

  function nightTotalToSurchargePercent(value) {
    return Math.max(0, (Number(value) || 100) - 100);
  }

  function updateExplanationLink(settings) {
    const link = document.querySelector(".account-explanation-link");
    if (!link || !settings) return;
    const params = new URLSearchParams({
      source: "account",
      dayRate: String(Number(settings.defaultDayRate) || settingsService.defaults.defaultDayRate),
      normalDayHours: String(Number(settings.normalDayHours) || settingsService.defaults.normalDayHours),
      nightTotalPercent: String(nightSurchargeToTotalPercent(settings.nightSurchargePercent)),
      travelWithinEuropePercent: String(Number(settings.travelWithinEuropePercent) || settingsService.defaults.travelWithinEuropePercent),
      travelOutsideEuropePercent: String(Number(settings.travelOutsideEuropePercent) || settingsService.defaults.travelOutsideEuropePercent)
    });
    link.href = `uitleg-werkregels.html?${params}`;
  }

  function populateSettings(settings) {
    const values = settings || settingsService.defaults;
    loadedSettings = { ...settingsService.defaults, ...values };
    Object.entries(values).forEach(([name, value]) => {
      const field = settingsForm.elements.namedItem(name);
      if (!field) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = name === "nightSurchargePercent" ? nightSurchargeToTotalPercent(value) : value;
    });
    updateDepartmentFields();
    updateRateFields();
    updateNightFields();
    globalThis.OveruurtjeSelectUI?.enhanceAll(settingsForm);
    updateExplanationLink(loadedSettings);
  }

  function readSettings() {
    const data = new FormData(settingsForm);
    const canEditEquipment = Boolean(currentContext?.subscription.isPro);
    const checked = (name) => data.get(name) === "on";
    const selectedFunction = selectedWorkFunction();
    return {
      defaultDepartment: selectedFunction?.department || (data.get("defaultDepartment") === "audio" ? "audio" : "camera"),
      defaultDayRate: Number(data.get("defaultDayRate")) || 0,
      defaultRateMode: data.get("defaultRateMode") === "hour" ? "hour" : "day",
      defaultHourlyRate: Number(data.get("defaultHourlyRate")) || 0,
      defaultBreakMinutes: loadedSettings.defaultBreakMinutes || 0,
      enableBreak: checked("enableBreak"),
      normalDayHours: Number(data.get("normalDayHours")) === 12 ? 12 : 10,
      minimumHours: Math.min(12, Math.max(0, Number(data.get("minimumHours")) || 0)),
      enableHalfDayUnder6Hours: checked("enableHalfDayUnder6Hours"),
      enableOvertime10To12: checked("enableOvertime10To12"),
      enableOvertimeFrom12: checked("enableOvertimeFrom12"),
      enableOvertimeFrom14: checked("enableOvertimeFrom14"),
      enableNightTariff: checked("enableNightTariff"),
      nightStart: data.get("nightStart") || "00:00",
      nightEnd: data.get("nightEnd") || "06:00",
      nightSurchargePercent: Math.min(500, nightTotalToSurchargePercent(data.get("nightSurchargePercent"))),
      travelWithinEuropePercent: Math.min(500, Math.max(0, Number(data.get("travelWithinEuropePercent")) || 0)),
      travelOutsideEuropePercent: Math.min(500, Math.max(0, Number(data.get("travelOutsideEuropePercent")) || 0)),
      mileageRate: Number(data.get("mileageRate")) || 0,
      parkingDefaultAmount: loadedSettings.parkingDefaultAmount || 0,
      droneVisible: canEditEquipment ? data.get("droneVisible") === "on" : loadedSettings.droneVisible,
      roninVisible: canEditEquipment ? data.get("roninVisible") === "on" : loadedSettings.roninVisible,
      droneTariffAmount: canEditEquipment ? Number(data.get("droneTariffAmount")) || 0 : loadedSettings.droneTariffAmount,
      roninTariffAmount: canEditEquipment ? Number(data.get("roninTariffAmount")) || 0 : loadedSettings.roninTariffAmount,
      frequentClients: loadedSettings.frequentClients || [],
      preferences: loadedSettings.preferences || {}
    };
  }

  function renderClients() {
    const clients = loadedSettings.frequentClients || [];
    accountClientList.replaceChildren(...clients.map((name) => {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const remove = document.createElement("button");
      label.textContent = name;
      remove.type = "button";
      remove.className = "client-remove-button";
      remove.setAttribute("aria-label", `${name} verwijderen`);
      remove.title = "Verwijderen";
      remove.textContent = "×";
      remove.addEventListener("click", async () => {
        loadedSettings = await settingsService.save(currentContext.auth.user.id, {
          ...readSettings(),
          frequentClients: clients.filter((item) => item !== name)
        });
        renderClients();
        accountClientStatus.textContent = "Opdrachtgever verwijderd.";
      });
      row.append(label, remove);
      return row;
    }));
    accountClientList.hidden = clients.length === 0;
  }

  async function renderNotificationPermission() {
    if (!accountEnableNotifications) return;
    const result = pushService
      ? await pushService.inspect()
      : { state: "unsupported" };
    const labels = {
      subscribed: "Meldingen uitschakelen",
      ready: "Meldingen inschakelen",
      prompt: "Meldingen inschakelen",
      denied: "Geblokkeerd in browser",
      unsupported: "Niet ondersteund",
      unconfigured: "Nog niet ingesteld",
      "ios-install-required": "Installeer eerst de app"
    };
    const descriptions = {
      subscribed: "Meldingen zijn actief op dit apparaat.",
      ready: "De browser geeft toestemming, maar dit apparaat is nog niet aangemeld voor pushberichten.",
      denied: "Sta meldingen toe via de instellingen van je browser of iPhone.",
      unsupported: "Deze browser ondersteunt geen pushmeldingen.",
      unconfigured: "Voeg Overuurtje toe aan het beginscherm van je telefoon en open de app vanaf daar om meldingen in te schakelen.",
      "ios-install-required": "Open Overuurtje vanaf je iPhone-beginscherm om meldingen in te schakelen."
    };
    accountEnableNotifications.dataset.pushState = result.state;
    accountEnableNotifications.setAttribute("aria-checked", String(result.state === "subscribed"));
    accountEnableNotifications.disabled = ["denied", "unsupported", "unconfigured"].includes(result.state);
    const label = accountEnableNotifications.querySelector("[data-notification-switch-label]");
    if (label) label.textContent = labels[result.state] || "Meldingen inschakelen";
    accountNotificationStatus.textContent = descriptions[result.state] || "";
  }

  function renderProfileAvatar(profile) {
    const name = profile?.displayName || "O";
    if (profileAvatarFallback) profileAvatarFallback.textContent = name.slice(0, 1).toUpperCase();
    if (!profileAvatarPreview || !profileAvatarFallback) return;
    const url = String(profile?.avatarUrl || "").trim();
    profileAvatarPreview.hidden = !url;
    profileAvatarFallback.hidden = Boolean(url);
    if (url) profileAvatarPreview.src = url;
  }

  function renderFunctions(items) {
    const seenNames = new Set();
    workFunctions = items.filter((item) => {
      const key = String(item.name || "").trim().toLocaleLowerCase("nl");
      if (!key || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
    const selected = workFunctions.find((item) => item.isDefault) || workFunctions[0] || null;
    functionSelect.replaceChildren(...workFunctions.map((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      return option;
    }));
    if (selected) {
      functionSelect.value = selected.id;
      applyFunctionSettings(selected);
    }
    removeFunctionButton.disabled = !selected || functionService.isStandard(selected);
    defaultDayRateLabel.textContent = selected ? `Dagtarief voor ${selected.name}` : "Standaard dagtarief";
    updateDepartmentFields();
    globalThis.OveruurtjeSelectUI?.enhanceAll(settingsForm);
  }

  function functionCalculationSettings(item) {
    const values = readSettings();
    const previous = item?.calculationSettings || {};
    return {
      settings: {
        dayRate: Number(settingsForm.elements.namedItem("defaultDayRate").value) || 0,
        rateMode: values.defaultRateMode,
        hourlyRate: values.defaultHourlyRate,
        enableBreak: values.enableBreak,
        breakMinutes: values.defaultBreakMinutes,
        normalDayHours: values.normalDayHours,
        minimumHours: values.minimumHours,
        enableHalfDayUnder6Hours: values.enableHalfDayUnder6Hours,
        enableOvertime10To12: values.enableOvertime10To12,
        enableOvertimeFrom12: values.enableOvertimeFrom12,
        enableOvertimeFrom14: values.enableOvertimeFrom14,
        enableNightTariff: values.enableNightTariff,
        nightStart: values.nightStart,
        nightEnd: values.nightEnd,
        nightSurchargePercent: values.nightSurchargePercent,
        travelWithinEuropePercent: values.travelWithinEuropePercent,
        travelOutsideEuropePercent: values.travelOutsideEuropePercent,
        kilometerRate: values.mileageRate,
        droneTariffAmount: values.droneTariffAmount,
        ronin4dTariffAmount: values.roninTariffAmount
      },
      equipmentVisibility: {
        drone: values.droneVisible,
        ronin: values.roninVisible
      },
      extras: previous.extras || {}
    };
  }

  function applyFunctionSettings(item) {
    if (!item) return;
    const preset = item.calculationSettings || {};
    const settings = preset.settings || {};
    populateSettings({
      ...loadedSettings,
      defaultDepartment: item.department,
      defaultDayRate: item.dayRate,
      defaultRateMode: settings.rateMode ?? loadedSettings.defaultRateMode,
      defaultHourlyRate: settings.hourlyRate ?? loadedSettings.defaultHourlyRate,
      enableBreak: settings.enableBreak ?? loadedSettings.enableBreak,
      normalDayHours: settings.normalDayHours ?? loadedSettings.normalDayHours,
      minimumHours: settings.minimumHours ?? loadedSettings.minimumHours,
      enableHalfDayUnder6Hours: settings.enableHalfDayUnder6Hours ?? loadedSettings.enableHalfDayUnder6Hours,
      enableOvertime10To12: settings.enableOvertime10To12 ?? loadedSettings.enableOvertime10To12,
      enableOvertimeFrom12: settings.enableOvertimeFrom12 ?? loadedSettings.enableOvertimeFrom12,
      enableOvertimeFrom14: settings.enableOvertimeFrom14 ?? loadedSettings.enableOvertimeFrom14,
      enableNightTariff: settings.enableNightTariff ?? loadedSettings.enableNightTariff,
      nightStart: settings.nightStart ?? loadedSettings.nightStart,
      nightEnd: settings.nightEnd ?? loadedSettings.nightEnd,
      nightSurchargePercent: settings.nightSurchargePercent ?? loadedSettings.nightSurchargePercent,
      travelWithinEuropePercent: settings.travelWithinEuropePercent ?? loadedSettings.travelWithinEuropePercent,
      travelOutsideEuropePercent: settings.travelOutsideEuropePercent ?? loadedSettings.travelOutsideEuropePercent,
      mileageRate: settings.kilometerRate ?? loadedSettings.mileageRate,
      droneVisible: preset.equipmentVisibility?.drone ?? loadedSettings.droneVisible,
      roninVisible: preset.equipmentVisibility?.ronin ?? loadedSettings.roninVisible,
      droneTariffAmount: settings.droneTariffAmount ?? loadedSettings.droneTariffAmount,
      roninTariffAmount: settings.ronin4dTariffAmount ?? loadedSettings.roninTariffAmount
    });
    settingsForm.elements.namedItem("defaultDayRate").value = String(item.dayRate);
    displayedFunctionId = item.id;
  }

  function selectedWorkFunction() {
    return workFunctions.find((item) => item.id === functionSelect.value)
      || workFunctions.find((item) => item.isDefault)
      || workFunctions[0]
      || null;
  }

  function standardFunctionChoices(settings = {}) {
    const defaultDepartment = settings.defaultDepartment === "audio" ? "audio" : "camera";
    return functionService.standardFunctions.map((item) => ({
      ...item,
      id: `standard-${item.department}`,
      dayRate: item.department === defaultDepartment && Number.isFinite(Number(settings.defaultDayRate))
        ? Number(settings.defaultDayRate)
        : item.dayRate,
      isDefault: item.department === defaultDepartment
    }));
  }

  async function ensureStandardFunctions(userId, savedSettings, items) {
    try {
      return await functionService.ensureStandards(userId, items, savedSettings);
    } catch (error) {
      const existingFunctions = await functionService.list(userId);
      return existingFunctions.length ? existingFunctions : standardFunctionChoices(savedSettings);
    }
  }

  function renderEquipment(items) {
    customEquipment = items;
    const isPro = Boolean(currentContext?.subscription.isPro);
    equipmentList.replaceChildren(...items.map((item) => {
      const row = document.createElement("div");
      row.className = "account-equipment-row custom-account-equipment";
      row.dataset.equipmentId = item.id;
      row.innerHTML = `
        <label class="account-toggle-row checkbox-label">
          <input type="checkbox" data-equipment-visible ${item.isVisible ? "checked" : ""} ${isPro ? "" : "disabled"}>
          <span><strong></strong><small>Tonen als optie in de calculator</small></span>
        </label>
        <label class="equipment-amount-field"><span>Vergoeding</span><span class="prefixed-input"><span>€</span><input type="number" data-equipment-amount min="0" step="0.01" value="${item.amount}" ${isPro ? "" : "disabled"}></span></label>
        <button class="remove-equipment-button" type="button" aria-label="Apparatuur verwijderen" title="Apparatuur verwijderen" ${isPro ? "" : "disabled"}>&times;</button>
      `;
      row.querySelector("strong").textContent = item.name;
      row.querySelector(".remove-equipment-button").addEventListener("click", async () => {
        if (!currentContext?.subscription.isPro) return;
        settingsStatus.textContent = "Apparatuur verwijderen…";
        try {
          await equipmentService.remove(currentContext.auth.user.id, item.id);
          renderEquipment(customEquipment.filter((equipment) => equipment.id !== item.id));
          settingsStatus.textContent = "Apparatuur verwijderd.";
        } catch (error) {
          settingsStatus.textContent = error.message || "Verwijderen is niet gelukt.";
        }
      });
      return row;
    }));
  }

  function readEquipmentRows() {
    return Array.from(equipmentList.querySelectorAll("[data-equipment-id]")).map((row) => ({
      id: row.dataset.equipmentId,
      name: customEquipment.find((item) => item.id === row.dataset.equipmentId)?.name || "Apparatuur",
      amount: Number(row.querySelector("[data-equipment-amount]").value) || 0,
      isVisible: row.querySelector("[data-equipment-visible]").checked
    }));
  }

  function updateDepartmentFields() {
    const selectedFunction = selectedWorkFunction();
    const isCamera = currentContext?.subscription.isPro && selectedFunction
      ? selectedFunction.department === "camera"
      : settingsForm.elements.namedItem("defaultDepartment").value === "camera";
    roninRow.hidden = !isCamera;
    if (!isCamera) settingsForm.elements.namedItem("roninVisible").checked = false;
  }

  function updateRateFields() {
    const rateMode = settingsForm.elements.namedItem("defaultRateMode").value;
    settingsForm.elements.namedItem("defaultDayRate").closest("label").hidden = rateMode === "hour";
    settingsForm.querySelector('[data-account-rate="hour"]').hidden = rateMode !== "hour";
    settingsForm.querySelector('[data-account-rate-setting="day-hours"]').hidden = rateMode === "hour";
    settingsForm.querySelector('[data-account-rate-setting="minimum-hours"]').hidden = rateMode !== "hour";
    settingsForm.querySelector('[data-account-rate-setting="half-day"]').hidden = rateMode === "hour";
  }

  function updateNightFields() {
    document.querySelector("#account-night-period").hidden = !settingsForm.elements.namedItem("enableNightTariff").checked;
  }

  function renderSubscription(subscription, profile) {
    const isPro = subscription.isPro;
    const isTrial = subscription.isTrial;
    const isPaidPro = subscription.isPaidPro;
    content.classList.toggle("is-pro", isPro);
    content.classList.toggle("is-free", !isPro);
    planPill.textContent = isTrial ? "Pro proef" : (isPaidPro ? "Pro" : "Free");
    planPill.classList.toggle("pro", isPro);
    planPill.classList.toggle("trial", isTrial);
    planTitle.textContent = isTrial ? "Pro-proefperiode actief" : (isPaidPro ? "Overuurtje Pro" : "Overuurtje Free");
    planDescription.textContent = isTrial
      ? `Je probeert alle Pro-functies gratis. Nog ${subscription.trialDaysRemaining} ${subscription.trialDaysRemaining === 1 ? "dag" : "dagen"}; er wordt niets automatisch afgeschreven.`
      : (isPaidPro
        ? "Je betaalde Pro-status is actief. Shopify beheert je abonnement."
        : "De calculator blijft gratis beschikbaar. Upgrade wanneer je Pro-functies wilt gebruiken.");
    upgradeButton.hidden = isPaidPro;
    upgradeButton.textContent = isTrial ? "Behoud Pro na je proefperiode" : "Upgrade naar Pro";
    manageButton.hidden = !isPaidPro;
    subscriptionStopButton.hidden = !isPaidPro;
    subscriptionManagementCopy.textContent = isTrial
      ? `Je proefperiode blijft gratis actief tot en met ${formatDate(subscription.trialEndsAt)}. Een betaald Shopify-abonnement begint zodra je het afsluit.`
      : (isPaidPro
        ? "Je abonnement en betalingen worden veilig beheerd via The GearHarbor."
        : "Je kiest maand- of jaarbetaling veilig op de abonnementspagina van The GearHarbor.");
    subscriptionPeriod.hidden = !(isPro || subscription.isExpiredTrial);
    if (isTrial) {
      subscriptionPeriodLabel.textContent = "Pro gratis tot en met";
      subscriptionPeriodValue.textContent = formatDate(subscription.trialEndsAt);
    } else if (isPaidPro) {
      subscriptionPeriodLabel.textContent = profile?.subscriptionCancelAtPeriodEnd
        ? "Abonnement stopt op"
        : "Abonnement loopt tot";
      subscriptionPeriodValue.textContent = profile?.subscriptionCurrentPeriodEnd
        ? formatDate(profile.subscriptionCurrentPeriodEnd)
        : "Nog niet door Shopify aangeleverd";
    } else if (subscription.isExpiredTrial) {
      subscriptionPeriodLabel.textContent = "Pro-proefperiode afgelopen op";
      subscriptionPeriodValue.textContent = formatDate(subscription.trialEndsAt);
    }
    freePlanOption.classList.toggle("is-current", !isPro);
    proPlanOption.classList.toggle("is-current", isPaidPro);
    proPlanOption.classList.toggle("is-trial", isTrial);
    freePlanState.textContent = !isPro ? "Huidig abonnement" : "Altijd beschikbaar";
    proPlanState.textContent = isPaidPro
      ? "Huidig abonnement"
      : (isTrial ? "Proefperiode actief" : "Meest compleet");
    mockControl.hidden = !subscriptions.canMock();
    if (subscriptions.canMock()) mockPlan.value = isPro ? "pro" : "free";
    equipmentSection.classList.toggle("is-locked", !isPro);
    compactFunctionSetting.hidden = !isPro;
    proPreviewSection.hidden = isPro;
    proPreviewSection.classList.remove("is-locked");
    proFeaturesTitle.textContent = "Ontdek Overuurtje Pro";
    equipmentSection.querySelectorAll("input").forEach((input) => { input.disabled = !isPro; });
    equipmentSection.querySelectorAll("button").forEach((button) => { button.disabled = !isPro; });
    settingsForm.querySelectorAll("[data-function-fallback]").forEach((field) => { field.hidden = isPro; });
    equipmentSection.querySelector("[data-pro-state]").textContent = isPro ? "Pro actief" : "Pro";
  }

  async function render(context) {
    currentContext = context;
    const authState = context.auth;
    setVisible(unavailable, !authState.loading && !authState.available);
    setVisible(loggedOut, authState.available && !authState.user);
    setVisible(content, Boolean(authState.user));
    if (!authState.user) return;

    try {
      await pushService?.refresh();
    } catch (error) {
      console.warn("De pushsubscription kon niet worden ververst.", error);
    }
    await renderNotificationPermission();

    email.textContent = authState.user.email || "-";
    created.textContent = formatDate(context.profile?.createdAt || authState.user.created_at);
    profileNameForm.elements.namedItem("displayName").value = context.profile?.displayName || "";
    renderProfileAvatar(context.profile);
    renderSubscription(context.subscription, context.profile);
    await renderMfaStatus();

    try {
      const [savedResult, functionsResult, equipmentResult] = await Promise.allSettled([
        settingsService.load(authState.user.id),
        context.subscription.isPro ? functionService.list(authState.user.id) : Promise.resolve([]),
        equipmentService.list(authState.user.id)
      ]);
      const saved = savedResult.status === "fulfilled" ? savedResult.value : null;
      const savedSettings = { ...settingsService.defaults, ...(saved || {}) };
      let functions = functionsResult.status === "fulfilled" ? functionsResult.value : [];
      if (context.subscription.isPro && functionsResult.status === "fulfilled") {
        functions = await ensureStandardFunctions(authState.user.id, savedSettings, functions);
      } else {
        functions = standardFunctionChoices(savedSettings);
      }
      const equipment = equipmentResult.status === "fulfilled" ? equipmentResult.value : [];
      populateSettings(saved);
      renderClients();
      renderFunctions(functions);
      renderEquipment(equipment);
      if ([savedResult, functionsResult, equipmentResult].some((result) => result.status === "rejected")) {
        settingsStatus.textContent = "Een deel van de cloudgegevens is nog niet beschikbaar. Controleer of alle Supabase-migrations zijn uitgevoerd.";
      }
    } catch (error) {
      console.warn("Accountinstellingen of apparatuur konden niet worden geladen.", error);
      settingsStatus.textContent = "Instellingen konden nog niet volledig worden geladen.";
      populateSettings(null);
      renderFunctions([]);
      renderEquipment([]);
    }

    if (new URLSearchParams(location.search).get("mode") === "reset") {
      passwordForm.elements.namedItem("password").focus();
    }
  }

  document.querySelector("#account-login-cta")?.addEventListener("click", () => sessionUi.openAuth("login"));
  accountAddClient?.addEventListener("click", async () => {
    const name = accountClientName.value.trim();
    if (!currentContext?.auth.user || !name) return;
    const frequentClients = settingsService.normalizeTextList([...(loadedSettings.frequentClients || []), name]);
    loadedSettings = await settingsService.save(currentContext.auth.user.id, {
      ...readSettings(),
      frequentClients
    });
    accountClientName.value = "";
    renderClients();
    accountClientStatus.textContent = "Opdrachtgever opgeslagen.";
  });
  accountClientName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      accountAddClient.click();
    }
  });
  accountEnableNotifications?.addEventListener("click", async () => {
    if (!pushService || !currentContext?.auth.user) return renderNotificationPermission();
    accountEnableNotifications.disabled = true;
    accountNotificationStatus.textContent = "Bezig…";
    try {
      if (accountEnableNotifications.dataset.pushState === "subscribed") {
        await pushService.unsubscribe();
      } else {
        await pushService.subscribe();
      }
    } catch (error) {
      accountNotificationStatus.textContent = error.message || "Meldingen konden niet worden aangepast.";
    }
    await renderNotificationPermission();
  });
  void renderNotificationPermission();
  profileNameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentContext?.auth.user || !profileNameForm.reportValidity()) return;
    profileNameStatus.textContent = "Opslaan…";
    try {
      const profile = await profileService.saveDisplayName(
        currentContext.auth.user,
        profileNameForm.elements.namedItem("displayName").value
      );
      currentContext = { ...currentContext, profile };
      profileNameForm.elements.namedItem("displayName").value = profile.displayName;
      renderProfileAvatar(profile);
      profileNameStatus.textContent = "Voornaam opgeslagen.";
      document.dispatchEvent(new CustomEvent("overuurtje:profile-updated", { detail: profile }));
    } catch (error) {
      profileNameStatus.textContent = error.message || "Voornaam opslaan is niet gelukt.";
    }
  });
  profileAvatarInput?.addEventListener("change", async () => {
    const file = profileAvatarInput.files?.[0];
    if (!file || !currentContext?.auth.user) return;
    try {
      const croppedFile = avatarCropper ? await avatarCropper.crop(file) : file;
      if (!croppedFile) {
        profileAvatarStatus.textContent = "";
        return;
      }
      profileAvatarStatus.textContent = "Foto opslaan…";
      const profile = await profileService.uploadAvatar(currentContext.auth.user, croppedFile);
      currentContext = { ...currentContext, profile };
      renderProfileAvatar(profile);
      profileAvatarStatus.textContent = "Profielfoto opgeslagen.";
      document.dispatchEvent(new CustomEvent("overuurtje:profile-updated", { detail: profile }));
    } catch (error) {
      profileAvatarStatus.textContent = error.message || "Profielfoto opslaan is niet gelukt.";
    } finally {
      profileAvatarInput.value = "";
    }
  });
  settingsForm.addEventListener("input", () => updateExplanationLink(readSettings()));
  settingsForm.addEventListener("change", () => {
    updateDepartmentFields();
    updateRateFields();
    updateNightFields();
    updateExplanationLink(readSettings());
  });
  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!settingsForm.reportValidity() || !currentContext?.auth.user) return;
    settingsStatus.textContent = "Opslaan…";
    try {
      const userId = currentContext.auth.user.id;
      const updates = currentContext.subscription.isPro
        ? readEquipmentRows().map((item) => equipmentService.update(userId, item.id, item))
        : [];
      if (currentContext.subscription.isPro) {
        let selected = selectedWorkFunction();
        if (selected) {
          if (String(selected.id).startsWith("standard-")) {
            const persisted = await functionService.ensureStandards(userId, [], readSettings());
            selected = persisted.find((item) => item.name === selected.name) || persisted[0];
          }
          await functionService.update(userId, selected.id, {
            ...selected,
            dayRate: Number(settingsForm.elements.namedItem("defaultDayRate").value) || 0,
            isDefault: false,
            calculationSettings: functionCalculationSettings(selected)
          });
          await functionService.setDefault(userId, selected.id);
        }
      }
      const [savedSettings] = await Promise.all([settingsService.save(userId, readSettings()), ...updates]);
      loadedSettings = savedSettings || loadedSettings;
      if (currentContext.subscription.isPro) renderFunctions(await functionService.list(userId));
      if (updates.length) renderEquipment(await equipmentService.list(userId));
      settingsStatus.textContent = "Instellingen opgeslagen en gesynchroniseerd.";
    } catch (error) {
      settingsStatus.textContent = error.message || "Opslaan is niet gelukt.";
    }
  });

  addFunctionButton.addEventListener("click", () => {
    if (!currentContext?.subscription.isPro) return;
    addFunctionForm.hidden = false;
    newFunctionName.focus();
  });
  document.querySelector("#cancel-function-add").addEventListener("click", () => {
    addFunctionForm.hidden = true;
    newFunctionName.value = "";
  });
  document.querySelector("#confirm-function-add").addEventListener("click", async () => {
    const name = newFunctionName.value.trim();
    if (!currentContext?.subscription.isPro || !name) {
      newFunctionName.focus();
      return;
    }
    settingsStatus.textContent = "Functie toevoegen…";
    try {
      const createdFunction = await functionService.create(currentContext.auth.user.id, {
        name,
        department: selectedWorkFunction()?.department || loadedSettings.defaultDepartment,
        dayRate: Number(settingsForm.elements.namedItem("defaultDayRate").value) || 0,
        isDefault: false,
        sortOrder: workFunctions.length,
        calculationSettings: functionCalculationSettings(selectedWorkFunction())
      });
      renderFunctions([...workFunctions, createdFunction]);
      functionSelect.value = createdFunction.id;
      applyFunctionSettings(createdFunction);
      defaultDayRateLabel.textContent = `Dagtarief voor ${createdFunction.name}`;
      addFunctionForm.hidden = true;
      newFunctionName.value = "";
      settingsStatus.textContent = "Functie toegevoegd. Vul het dagtarief in en sla de instellingen op.";
    } catch (error) {
      settingsStatus.textContent = error.message || "Toevoegen is niet gelukt.";
    }
  });

  functionSelect.addEventListener("change", async () => {
    const selected = selectedWorkFunction();
    if (!selected) return;
    const previous = workFunctions.find((item) => item.id === displayedFunctionId);
    if (previous && previous.id !== selected.id && currentContext?.subscription.isPro) {
      try {
        const savedPrevious = await functionService.update(currentContext.auth.user.id, previous.id, {
          ...previous,
          dayRate: Number(settingsForm.elements.namedItem("defaultDayRate").value) || previous.dayRate,
          calculationSettings: functionCalculationSettings(previous)
        });
        workFunctions = workFunctions.map((item) => item.id === savedPrevious.id ? savedPrevious : item);
      } catch (error) {
        settingsStatus.textContent = error.message || "De vorige functie-instellingen konden niet worden opgeslagen.";
      }
    }
    applyFunctionSettings(selected);
    defaultDayRateLabel.textContent = `Dagtarief voor ${selected.name}`;
    removeFunctionButton.disabled = functionService.isStandard(selected);
    updateDepartmentFields();
  });

  removeFunctionButton.addEventListener("click", async () => {
    const selected = selectedWorkFunction();
    if (!currentContext?.subscription.isPro || !selected || functionService.isStandard(selected)) return;
    if (!confirm(`Functie “${selected.name}” verwijderen?`)) return;
    settingsStatus.textContent = "Functie verwijderen…";
    try {
      await functionService.remove(currentContext.auth.user.id, selected.id);
      let remaining = await functionService.list(currentContext.auth.user.id);
      if (!remaining.some((item) => item.isDefault) && remaining.length) {
        await functionService.setDefault(currentContext.auth.user.id, remaining[0].id);
        remaining = await functionService.list(currentContext.auth.user.id);
      }
      renderFunctions(remaining);
      settingsStatus.textContent = "Functie verwijderd.";
    } catch (error) {
      settingsStatus.textContent = error.message || "Verwijderen is niet gelukt.";
    }
  });

  addEquipmentButton.addEventListener("click", () => {
    if (!currentContext?.subscription.isPro) return;
    addEquipmentForm.hidden = false;
    newEquipmentName.focus();
  });
  document.querySelector("#cancel-equipment-add").addEventListener("click", () => {
    addEquipmentForm.hidden = true;
    newEquipmentName.value = "";
    newEquipmentAmount.value = "0";
  });
  document.querySelector("#confirm-equipment-add").addEventListener("click", async () => {
    const name = newEquipmentName.value.trim();
    if (!currentContext?.subscription.isPro || !name) {
      newEquipmentName.focus();
      return;
    }
    settingsStatus.textContent = "Apparatuur toevoegen…";
    try {
      const createdEquipment = await equipmentService.create(currentContext.auth.user.id, {
        name,
        amount: Number(newEquipmentAmount.value) || 0,
        isVisible: true
      });
      renderEquipment([...customEquipment, createdEquipment]);
      addEquipmentForm.hidden = true;
      newEquipmentName.value = "";
      newEquipmentAmount.value = "0";
      settingsStatus.textContent = "Apparatuur toegevoegd.";
    } catch (error) {
      settingsStatus.textContent = error.message || "Toevoegen is niet gelukt.";
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!passwordForm.reportValidity()) return;
    const passwordInput = passwordForm.elements.namedItem("password");
    const validation = auth.validatePassword(passwordInput.value);
    if (!validation.valid) {
      passwordStatus.textContent = validation.message;
      passwordInput.focus();
      return;
    }
    passwordStatus.textContent = "Wijzigen…";
    const { error } = await auth.updatePassword(passwordInput.value);
    if (error) {
      passwordStatus.textContent = error.message;
      return;
    }
    passwordForm.reset();
    passwordStatus.textContent = "Wachtwoord gewijzigd.";
  });

  mfaAction?.addEventListener("click", async () => {
    mfaAction.disabled = true;
    mfaStatus.textContent = verifiedMfaFactor
      ? "Tweestapsverificatie uitschakelen…"
      : "Tweestapsverificatie instellen…";
    try {
      if (!verifiedMfaFactor) {
        await startMfaEnrollment();
        return;
      }

      const verified = await sessionUi.requireMfaVerification();
      if (!verified) return;
      const response = await auth.unenrollMfa(verifiedMfaFactor.id);
      if (response.error) throw response.error;
      verifiedMfaFactor = null;
      mfaStatus.textContent = "Tweestapsverificatie is uitgeschakeld.";
      await renderMfaStatus();
    } catch (error) {
      mfaStatus.textContent = error.message || "De instelling kon niet worden gewijzigd.";
    } finally {
      mfaAction.disabled = false;
    }
  });

  mockPlan.addEventListener("change", () => subscriptions.setMockPlan(mockPlan.value));
  document.addEventListener("overuurtje:user-context", (event) => render(event.detail));
  loadShopifyPricing();
  sessionUi.ready.then(render);
})();
