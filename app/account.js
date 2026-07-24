(function initializeAccountPage() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const auth = globalThis.OveruurtjeAuth;
  const settingsService = globalThis.OveruurtjeSettings;
  const equipmentService = globalThis.OveruurtjeEquipment;
  const projectService = globalThis.OveruurtjeProjects;
  const workdayService = globalThis.OveruurtjeWorkdays;
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
  const planTitle = document.querySelector("#subscription-plan-title");
  const planDescription = document.querySelector("#subscription-plan-description");
  const upgradeButton = document.querySelector(".subscription-actions [data-subscription-upgrade]");
  const manageButton = document.querySelector(".subscription-actions [data-subscription-manage]");
  const mockControl = document.querySelector("#mock-plan-control");
  const mockPlan = document.querySelector("#mock-plan");
  const roninRow = document.querySelector("#account-ronin-row");
  const equipmentSection = document.querySelector("#account-equipment-section");
  const proPreviewSection = document.querySelector(".pro-preview-section");
  const proFeaturesTitle = document.querySelector("#pro-features-title");
  const equipmentList = document.querySelector("#custom-equipment-account-list");
  const addEquipmentButton = document.querySelector("#add-equipment-button");
  const addEquipmentForm = document.querySelector("#add-equipment-form");
  const accountProjectList = document.querySelector("#account-project-list");
  const accountProjectsSection = document.querySelector(".account-projects-section");
  const accountWorkdayList = document.querySelector("#account-workday-list");
  const accountWorkdaysSection = document.querySelector(".account-workdays-section");
  const newEquipmentName = document.querySelector("#new-equipment-name");
  const newEquipmentAmount = document.querySelector("#new-equipment-amount");
  let currentContext = null;
  let loadedSettings = settingsService.defaults;
  let customEquipment = [];

  function setVisible(element, visible) {
    element.hidden = !visible;
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value));
  }

  function formatWorkDate(value) {
    if (!value) return "-";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" })
      .format(new Date(year, month - 1, day));
  }

  function populateSettings(settings) {
    const values = settings || settingsService.defaults;
    loadedSettings = { ...settingsService.defaults, ...values };
    Object.entries(values).forEach(([name, value]) => {
      const field = settingsForm.elements.namedItem(name);
      if (!field) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value;
    });
    updateDepartmentFields();
    updateRateFields();
    updateNightFields();
  }

  function readSettings() {
    const data = new FormData(settingsForm);
    const canEditEquipment = Boolean(currentContext?.subscription.isPro);
    const checked = (name) => data.get(name) === "on";
    return {
      defaultDepartment: data.get("defaultDepartment") === "audio" ? "audio" : "camera",
      defaultDayRate: Number(data.get("defaultDayRate")) || 0,
      defaultRateMode: data.get("defaultRateMode") === "hour" ? "hour" : "day",
      defaultHourlyRate: Number(data.get("defaultHourlyRate")) || 0,
      defaultBreakMinutes: loadedSettings.defaultBreakMinutes || 0,
      enableBreak: checked("enableBreak"),
      normalDayHours: Number(data.get("normalDayHours")) === 12 ? 12 : 10,
      enableHalfDayUnder6Hours: checked("enableHalfDayUnder6Hours"),
      enableOvertime10To12: checked("enableOvertime10To12"),
      enableOvertimeFrom12: checked("enableOvertimeFrom12"),
      enableOvertimeFrom14: checked("enableOvertimeFrom14"),
      enableNightTariff: checked("enableNightTariff"),
      nightStart: data.get("nightStart") || "00:00",
      nightEnd: data.get("nightEnd") || "06:00",
      mileageRate: Number(data.get("mileageRate")) || 0,
      parkingDefaultAmount: loadedSettings.parkingDefaultAmount || 0,
      droneVisible: canEditEquipment ? data.get("droneVisible") === "on" : loadedSettings.droneVisible,
      roninVisible: canEditEquipment ? data.get("roninVisible") === "on" : loadedSettings.roninVisible,
      droneTariffAmount: canEditEquipment ? Number(data.get("droneTariffAmount")) || 0 : loadedSettings.droneTariffAmount,
      roninTariffAmount: canEditEquipment ? Number(data.get("roninTariffAmount")) || 0 : loadedSettings.roninTariffAmount,
      preferences: loadedSettings.preferences || {}
    };
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
    const isCamera = settingsForm.elements.namedItem("defaultDepartment").value === "camera";
    roninRow.hidden = !isCamera;
    if (!isCamera) settingsForm.elements.namedItem("roninVisible").checked = false;
  }

  function updateRateFields() {
    const rateMode = settingsForm.elements.namedItem("defaultRateMode").value;
    settingsForm.elements.namedItem("defaultDayRate").closest("label").hidden = rateMode === "hour";
    settingsForm.querySelector('[data-account-rate="hour"]').hidden = rateMode !== "hour";
  }

  function updateNightFields() {
    document.querySelector("#account-night-period").hidden = !settingsForm.elements.namedItem("enableNightTariff").checked;
  }

  function fillQuarterHourSelect(select) {
    select.innerHTML = Array.from({ length: 96 }, (_, index) => {
      const hour = String(Math.floor(index / 4)).padStart(2, "0");
      const minute = String((index % 4) * 15).padStart(2, "0");
      const time = `${hour}:${minute}`;
      return `<option value="${time}">${time}</option>`;
    }).join("");
  }

  function renderSubscription(subscription, profile) {
    const isPro = subscription.isPro;
    content.classList.toggle("is-pro", isPro);
    content.classList.toggle("is-free", !isPro);
    planPill.textContent = isPro ? "Pro" : "Free";
    planPill.classList.toggle("pro", isPro);
    planTitle.textContent = isPro ? "Overuurtje Pro" : "Overuurtje Free";
    planDescription.textContent = isPro
      ? "Je Pro-status is actief. Shopify blijft straks de bron voor abonnementswijzigingen."
      : "De calculator blijft gratis beschikbaar. Upgrade zodra je de toekomstige Pro-functies wilt gebruiken.";
    upgradeButton.hidden = isPro;
    manageButton.hidden = !isPro;
    subscriptionStopButton.hidden = !isPro;
    subscriptionPeriod.hidden = !isPro;
    if (isPro) {
      subscriptionPeriodLabel.textContent = profile?.subscriptionCancelAtPeriodEnd
        ? "Abonnement stopt op"
        : "Abonnement loopt tot";
      subscriptionPeriodValue.textContent = profile?.subscriptionCurrentPeriodEnd
        ? formatDate(profile.subscriptionCurrentPeriodEnd)
        : "Nog niet door Shopify aangeleverd";
    }
    mockControl.hidden = !subscriptions.canMock();
    if (subscriptions.canMock()) mockPlan.value = isPro ? "pro" : "free";
    equipmentSection.classList.toggle("is-locked", !isPro);
    proPreviewSection.hidden = isPro;
    proPreviewSection.classList.remove("is-locked");
    proFeaturesTitle.textContent = "Ontdek Overuurtje Pro";
    accountProjectsSection.classList.toggle("is-locked", !isPro);
    accountWorkdaysSection.classList.toggle("is-locked", !isPro);
    equipmentSection.querySelectorAll("input").forEach((input) => { input.disabled = !isPro; });
    equipmentSection.querySelectorAll("button").forEach((button) => { button.disabled = !isPro; });
    equipmentSection.querySelector("[data-pro-state]").textContent = isPro ? "Pro actief" : "Pro";
  }

  async function render(context) {
    currentContext = context;
    const authState = context.auth;
    setVisible(unavailable, !authState.loading && !authState.available);
    setVisible(loggedOut, authState.available && !authState.user);
    setVisible(content, Boolean(authState.user));
    if (!authState.user) return;

    email.textContent = authState.user.email || "-";
    created.textContent = formatDate(context.profile?.createdAt || authState.user.created_at);
    renderSubscription(context.subscription, context.profile);

    try {
      const [savedResult, equipmentResult, projectsResult, workdaysResult] = await Promise.allSettled([
        settingsService.load(authState.user.id),
        equipmentService.list(authState.user.id),
        context.subscription.isPro ? projectService.list(authState.user.id, { mock: context.subscription.isMock }) : Promise.resolve([]),
        context.subscription.isPro ? workdayService.list(authState.user.id, { mock: context.subscription.isMock }) : Promise.resolve([])
      ]);
      const saved = savedResult.status === "fulfilled" ? savedResult.value : null;
      const equipment = equipmentResult.status === "fulfilled" ? equipmentResult.value : [];
      const savedProjects = projectsResult.status === "fulfilled" ? projectsResult.value : [];
      const savedWorkdays = workdaysResult.status === "fulfilled" ? workdaysResult.value : [];
      populateSettings(saved);
      renderEquipment(equipment);
      accountProjectList.replaceChildren(...savedProjects.slice(0, 4).map((project) => {
        const link = document.createElement("a");
        link.href = `projects.html?project=${encodeURIComponent(project.id)}`;
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        const client = document.createElement("small");
        title.textContent = project.name;
        client.textContent = project.clientName || "Project";
        copy.append(title, client);
        const arrow = document.createElement("span");
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        link.append(copy, arrow);
        return link;
      }));
      accountWorkdayList.replaceChildren(...savedWorkdays.slice(0, 4).map((workday) => {
        const snapshot = workday.calculationData || {};
        const link = document.createElement("a");
        link.href = `index.html?workday=${encodeURIComponent(workday.id)}`;
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        const detail = document.createElement("small");
        title.textContent = formatWorkDate(workday.workDate);
        detail.textContent = snapshot.endTime
          ? `${snapshot.startTime || "-"} – ${snapshot.endTime} · Afgerond`
          : `${snapshot.startTime || "-"} · Concept`;
        copy.append(title, detail);
        const arrow = document.createElement("span");
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        link.append(copy, arrow);
        return link;
      }));
      if ([savedResult, equipmentResult, projectsResult, workdaysResult].some((result) => result.status === "rejected")) {
        settingsStatus.textContent = "Een deel van de cloudgegevens is nog niet beschikbaar. Controleer of alle Supabase-migrations zijn uitgevoerd.";
      }
    } catch (error) {
      console.warn("Accountinstellingen of apparatuur konden niet worden geladen.", error);
      settingsStatus.textContent = "Instellingen konden nog niet volledig worden geladen.";
      populateSettings(null);
      renderEquipment([]);
    }

    if (new URLSearchParams(location.search).get("mode") === "reset") {
      passwordForm.elements.namedItem("password").focus();
    }
  }

  fillQuarterHourSelect(settingsForm.elements.namedItem("nightStart"));
  fillQuarterHourSelect(settingsForm.elements.namedItem("nightEnd"));
  document.querySelector("#account-login-cta")?.addEventListener("click", () => sessionUi.openAuth("login"));
  settingsForm.addEventListener("change", () => { updateDepartmentFields(); updateRateFields(); updateNightFields(); });
  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!settingsForm.reportValidity() || !currentContext?.auth.user) return;
    settingsStatus.textContent = "Opslaan…";
    try {
      const userId = currentContext.auth.user.id;
      const updates = currentContext.subscription.isPro
        ? readEquipmentRows().map((item) => equipmentService.update(userId, item.id, item))
        : [];
      const [savedSettings] = await Promise.all([settingsService.save(userId, readSettings()), ...updates]);
      loadedSettings = savedSettings || loadedSettings;
      if (updates.length) renderEquipment(await equipmentService.list(userId));
      settingsStatus.textContent = "Instellingen opgeslagen en gesynchroniseerd.";
    } catch (error) {
      settingsStatus.textContent = error.message || "Opslaan is niet gelukt.";
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
    passwordStatus.textContent = "Wijzigen…";
    const { error } = await auth.updatePassword(passwordForm.elements.namedItem("password").value);
    if (error) {
      passwordStatus.textContent = error.message;
      return;
    }
    passwordForm.reset();
    passwordStatus.textContent = "Wachtwoord gewijzigd.";
  });

  mockPlan.addEventListener("change", () => subscriptions.setMockPlan(mockPlan.value));
  document.addEventListener("overuurtje:user-context", (event) => render(event.detail));
  sessionUi.ready.then(render);
})();
