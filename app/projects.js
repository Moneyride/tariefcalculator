(function initializeProjectsPage() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const projects = globalThis.OveruurtjeProjects;
  const settingsService = globalThis.OveruurtjeSettings;
  const functionService = globalThis.OveruurtjeFunctions;
  const equipmentService = globalThis.OveruurtjeEquipment;
  const featureGate = globalThis.OveruurtjeFeatureGate;
  const shareUi = globalThis.OveruurtjeShareUI;
  const shares = globalThis.OveruurtjeShares;
  const calculator = globalThis.TariffCalculator;
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const number = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });
  const dateLong = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const monthLong = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
  const views = ["project-list-view", "project-form-view", "project-overview-view", "day-editor-view"];
  const list = document.querySelector("#project-list");
  const form = document.querySelector("#project-form");
  const dayForm = document.querySelector("#day-form");
  const sharedProjectsSection = document.querySelector("#shared-projects-section");
  const sharedProjectList = document.querySelector("#shared-project-list");
  const sharedProjectDialog = document.querySelector("#shared-project-dialog");
  const projectInviteDialog = document.querySelector("#project-invite-dialog");
  const projectClientInput = form.elements.namedItem("clientName");
  const projectClientSuggestions = document.querySelector("#project-client-suggestions");
  let context = null;
  let accountSettings = settingsService.defaults;
  let workFunctions = [];
  let equipment = [];
  let projectList = [];
  let sharedProjects = [];
  let activeProjectInvite = null;
  let current = null;
  let currentDayId = null;
  let dirty = false;
  let initializedContextKey = "";
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
  let periodStart = "";
  let periodEnd = "";
  let selectedWorkdays = new Set();

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const localDate = (iso) => new Date(`${iso}T12:00:00`);
  const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const formatDate = (iso) => dateLong.format(localDate(iso));
  const options = () => ({ mock: Boolean(context?.subscription.isMock) });
  const show = (id) => views.forEach((view) => { document.querySelector(`#${view}`).hidden = view !== id; });
  const setDirty = (value) => { dirty = value; };
  const openDialog = (dialog) => typeof dialog.showModal === "function" ? dialog.showModal() : dialog.setAttribute("open", "");
  const closeDialog = (dialog) => typeof dialog.close === "function" ? dialog.close() : dialog.removeAttribute("open");

  function renderClientSuggestions() {
    projectClientSuggestions.replaceChildren(...(accountSettings.frequentClients || []).map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }));
  }

  async function rememberProjectClient() {
    const value = projectClientInput.value.trim();
    if (!value || !context?.auth.user) return false;
    const exists = (accountSettings.frequentClients || [])
      .some((name) => name.localeCompare(value, "nl-NL", { sensitivity: "base" }) === 0);
    if (exists) return false;
    accountSettings = await settingsService.save(context.auth.user.id, {
      ...accountSettings,
      frequentClients: settingsService.normalizeTextList([...(accountSettings.frequentClients || []), value])
    });
    renderClientSuggestions();
    return true;
  }

  function defaultDayData() {
    const defaultFunction = workFunctions.find((item) => item.isDefault) || workFunctions[0] || null;
    const rateMode = accountSettings.defaultRateMode === "hour" ? "hour" : "day";
    return {
      startTime: "08:00", endTime: "18:00", breakMinutes: 0,
      workFunctionId: defaultFunction?.id || "",
      workFunctionName: defaultFunction?.name || "",
      department: defaultFunction?.department || accountSettings.defaultDepartment,
      rateMode: defaultFunction ? "day" : rateMode,
      rateAmount: defaultFunction?.dayRate ?? (rateMode === "hour" ? accountSettings.defaultHourlyRate : accountSettings.defaultDayRate),
      normalDayHours: accountSettings.normalDayHours,
      minimumHours: accountSettings.minimumHours,
      enableHalfDayUnder6Hours: accountSettings.enableHalfDayUnder6Hours,
      enableOvertime10To12: accountSettings.enableOvertime10To12,
      enableOvertimeFrom12: accountSettings.enableOvertimeFrom12,
      enableOvertimeFrom14: accountSettings.enableOvertimeFrom14,
      enableNightTariff: accountSettings.enableNightTariff,
      nightStart: accountSettings.nightStart,
      nightEnd: accountSettings.nightEnd,
      enableKilometers: false, kilometers: 0, kilometerRate: accountSettings.mileageRate,
      enableParkingCosts: false, parkingCosts: accountSettings.parkingDefaultAmount,
      enableDroneTariff: false, enableRonin4dTariff: false, customEquipment: []
    };
  }

  function calculate(data) {
    return calculator.calculateTariff({
      ...data,
      hourlyRate: data.rateMode === "hour" ? data.rateAmount : undefined
    }, {
      ...calculator.DEFAULT_SETTINGS,
      dayRate: data.rateMode === "day" ? data.rateAmount : accountSettings.defaultDayRate,
      normalDayHours: Number(data.normalDayHours) || 10,
      minimumHours: Math.min(12, Math.max(0, Number(data.minimumHours) || 0)),
      enableHalfDayUnder6Hours: Boolean(data.enableHalfDayUnder6Hours),
      enableOvertime10To12: Boolean(data.enableOvertime10To12),
      enableOvertimeFrom12: Boolean(data.enableOvertimeFrom12),
      enableOvertimeFrom14: Boolean(data.enableOvertimeFrom14),
      enableNightTariff: Boolean(data.enableNightTariff),
      nightStart: data.nightStart || "00:00", nightEnd: data.nightEnd || "06:00",
      droneTariffAmount: accountSettings.droneTariffAmount,
      ronin4dTariffAmount: accountSettings.roninTariffAmount,
      kilometerRate: Number(data.kilometerRate ?? accountSettings.mileageRate)
    });
  }

  function totals(days) {
    return days.reduce((all, day) => {
      const result = calculate({ ...defaultDayData(), ...day.calculationData });
      all.amount += result.subtotalExVat; all.hours += result.totalHours; all.overtime += result.overtimeHours;
      all.night += result.nightHours; all.kilometers += result.kilometers; all.parking += result.parkingAmount;
      all.surcharges += result.overtimeAmount + result.nightAmount + result.droneTariffAmount + result.ronin4dTariffAmount + result.customEquipmentAmount;
      return all;
    }, { amount: 0, hours: 0, overtime: 0, night: 0, kilometers: 0, parking: 0, surcharges: 0 });
  }

  function renderProjectList() {
    list.replaceChildren(...projectList.map((project) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "project-list-item";
      button.innerHTML = `<span><strong>${escapeHtml(project.name)}</strong><small>${project.clientName ? `${escapeHtml(project.clientName)} · ` : ""}${formatDate(project.startDate)} - ${formatDate(project.endDate)}</small></span><span aria-hidden="true">&#8594;</span>`;
      button.addEventListener("click", () => openProject(project.id));
      return button;
    }));
    document.querySelector("#project-list-empty").hidden = projectList.length > 0;
    show("project-list-view");
  }

  async function loadList() {
    projectList = await projects.list(context.auth.user.id, options());
    renderProjectList();
    const parameters = new URLSearchParams(location.search);
    if (parameters.get("new") === "1") {
      history.replaceState(null, "", location.pathname);
      openProjectForm();
      return;
    }
    const requested = parameters.get("project");
    const requestedDay = parameters.get("day");
    if (requested && projectList.some((project) => project.id === requested)) {
      history.replaceState(null, "", location.pathname);
      await openProject(requested, requestedDay);
    }
  }

  function renderSharedProjectDays(container, days) {
    container.replaceChildren(...days.map((day) => {
      const row = document.createElement("div");
      row.className = "shared-project-day";
      row.innerHTML = "<strong></strong><span></span>";
      row.querySelector("strong").textContent = formatDate(day.workDate);
      row.querySelector("span").textContent = `${day.startTime || "-"} – ${day.endTime || "eindtijd open"}`;
      return row;
    }));
  }

  function openSharedProject(project) {
    sharedProjectDialog.querySelector("[data-shared-project-title]").textContent = project.projectName;
    sharedProjectDialog.querySelector("[data-shared-project-owner]").textContent = `${project.ownerName} heeft dit project met je gedeeld.`;
    const clientRow = sharedProjectDialog.querySelector("[data-shared-project-client-row]");
    clientRow.hidden = !project.clientName;
    sharedProjectDialog.querySelector("[data-shared-project-client]").textContent = project.clientName;
    sharedProjectDialog.querySelector("[data-shared-project-period]").textContent = `${formatDate(project.startDate)} – ${formatDate(project.endDate)}`;
    sharedProjectDialog.querySelector("[data-shared-project-day-count]").textContent = String(project.days.length);
    const message = sharedProjectDialog.querySelector("[data-shared-project-message]");
    message.textContent = project.optionalMessage;
    message.hidden = !project.optionalMessage;
    renderSharedProjectDays(sharedProjectDialog.querySelector("[data-shared-project-days]"), project.days);
    openDialog(sharedProjectDialog);
  }

  function renderSharedProjects() {
    document.querySelector("#shared-project-count").textContent = String(sharedProjects.length);
    sharedProjectsSection.hidden = sharedProjects.length === 0;
    sharedProjectList.replaceChildren(...sharedProjects.map((project) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shared-project-list-item";
      button.innerHTML = `
        <span class="share-avatar"></span>
        <span>
          <strong></strong>
          <small></small>
        </span>
        <span class="workday-origin-tag">Gedeeld</span>
        <span aria-hidden="true">→</span>
      `;
      button.querySelector(".share-avatar").textContent = project.ownerName.charAt(0).toUpperCase();
      button.querySelector("strong").textContent = project.projectName;
      button.querySelector("small").textContent = `${project.ownerName} · ${formatDate(project.startDate)} – ${formatDate(project.endDate)} · ${project.days.length} werkdagen`;
      button.addEventListener("click", () => openSharedProject(project));
      return button;
    }));
  }

  async function loadSharedProjects() {
    sharedProjects = context?.auth.user ? await shares.listReceivedProjects() : [];
    renderSharedProjects();
  }

  function fillInviteDialog(invite) {
    projectInviteDialog.querySelector("[data-project-invite-title]").textContent = invite.projectName || "Gedeeld project";
    projectInviteDialog.querySelector("[data-project-invite-owner]").textContent = `${invite.ownerName} wil dit project met je delen.`;
    projectInviteDialog.querySelector("[data-project-invite-period]").textContent = `${formatDate(invite.startDate)} – ${formatDate(invite.endDate)} · ${invite.days.length} werkdagen`;
    const message = projectInviteDialog.querySelector("[data-project-invite-message]");
    message.textContent = invite.optionalMessage;
    message.hidden = !invite.optionalMessage;
    const loggedIn = Boolean(context?.auth.user);
    projectInviteDialog.querySelector("[data-project-invite-guest]").hidden = loggedIn;
    projectInviteDialog.querySelector("[data-project-invite-accept]").hidden = !loggedIn;
    projectInviteDialog.querySelector("[data-project-invite-status]").textContent = "";
  }

  async function loadProjectInvite() {
    const token = new URLSearchParams(location.search).get("invite");
    if (!token) return;
    try {
      activeProjectInvite = await shares.previewInvite(token, "project");
      if (!activeProjectInvite?.available) throw new Error("Deze uitnodiging is niet meer beschikbaar.");
      fillInviteDialog(activeProjectInvite);
      if (!projectInviteDialog.open) openDialog(projectInviteDialog);
    } catch (error) {
      activeProjectInvite = null;
      projectInviteDialog.querySelector("[data-project-invite-status]").textContent = error.message;
      if (!projectInviteDialog.open) openDialog(projectInviteDialog);
    }
  }

  async function acceptProjectInvite() {
    const token = new URLSearchParams(location.search).get("invite");
    if (!token) return;
    const status = projectInviteDialog.querySelector("[data-project-invite-status]");
    try {
      status.textContent = "Project wordt toegevoegd…";
      await shares.claimInvite(token, "project");
      history.replaceState(null, "", location.pathname);
      closeDialog(projectInviteDialog);
      await loadSharedProjects();
      const shared = sharedProjects.find((item) => item.projectId === activeProjectInvite?.projectId);
      if (shared) openSharedProject(shared);
      sessionUi.showToast("Project toegevoegd.");
    } catch (error) {
      status.textContent = error.message || "Project toevoegen is niet gelukt.";
    }
  }

  function dateRange(start, end) {
    if (!start || !end || end < start) return [];
    const dates = []; const cursor = localDate(start); const last = localDate(end);
    while (cursor <= last && dates.length < 370) { dates.push(isoDate(cursor)); cursor.setDate(cursor.getDate() + 1); }
    return dates;
  }

  function syncCalendarInputs() {
    form.elements.startDate.value = periodStart;
    form.elements.endDate.value = periodEnd;
  }

  function renderCalendar() {
    syncCalendarInputs();
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const firstDayOffset = (new Date(year, month, 1, 12).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
    const cells = Array.from({ length: firstDayOffset }, () => '<span class="calendar-day-spacer" aria-hidden="true"></span>');

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12);
      const iso = isoDate(date);
      const inPeriod = Boolean(periodStart && periodEnd && iso >= periodStart && iso <= periodEnd);
      const isWorkday = selectedWorkdays.has(iso);
      const classes = [
        "calendar-day",
        inPeriod ? "is-in-period" : "",
        isWorkday ? "is-workday" : "",
        iso === periodStart ? "is-period-start" : "",
        iso === periodEnd ? "is-period-end" : "",
        [0, 6].includes(date.getDay()) ? "is-weekend" : ""
      ].filter(Boolean).join(" ");
      const state = isWorkday ? "werkdag" : (inPeriod ? "geen werkdag" : "");
      cells.push(`<button type="button" class="${classes}" data-calendar-date="${iso}" aria-label="${formatDate(iso)}${state ? `, ${state}` : ""}" ${inPeriod ? `aria-pressed="${isWorkday}"` : ""}><span>${day}</span>${isWorkday ? '<i aria-hidden="true"></i>' : ""}</button>`);
    }

    while (cells.length % 7 !== 0) cells.push('<span class="calendar-day-spacer" aria-hidden="true"></span>');
    document.querySelector("#calendar-month").textContent = monthLong.format(calendarCursor);
    document.querySelector("#calendar-grid").innerHTML = cells.join("");
    const complete = Boolean(periodStart && periodEnd);
    document.querySelector("#calendar-reset").hidden = !periodStart;
    document.querySelector("#calendar-quick-actions").hidden = !complete;
    document.querySelector("#calendar-help").textContent = !periodStart
      ? "Kies eerst de eerste en laatste dag van het project."
      : (!periodEnd ? "Kies nu de laatste dag van het project." : "Tik op dagen binnen de periode om ze als werkdag aan of uit te zetten.");
    document.querySelector("#calendar-selection-summary").textContent = complete
      ? `${formatDate(periodStart)} - ${formatDate(periodEnd)} · ${selectedWorkdays.size} werkdagen geselecteerd`
      : (periodStart ? `Start op ${formatDate(periodStart)}; kies een einddatum.` : "Nog geen periode geselecteerd.");
  }

  function chooseCalendarDate(iso) {
    if (!periodStart) {
      periodStart = iso; periodEnd = ""; selectedWorkdays.clear();
    } else if (!periodEnd) {
      const start = iso < periodStart ? iso : periodStart;
      const end = iso < periodStart ? periodStart : iso;
      periodStart = start; periodEnd = end;
      selectedWorkdays = new Set(dateRange(start, end));
    } else if (iso >= periodStart && iso <= periodEnd) {
      if (selectedWorkdays.has(iso)) selectedWorkdays.delete(iso); else selectedWorkdays.add(iso);
    }
    setDirty(true);
    renderCalendar();
  }

  function openProjectForm(project = null) {
    current = project ? current : null;
    form.reset(); form.dataset.projectId = project?.id || "";
    document.querySelector("#project-form-title").textContent = project ? "Project wijzigen" : "Nieuw project";
    if (project) {
      form.elements.name.value = project.name; form.elements.clientName.value = project.clientName;
      form.elements.notes.value = project.notes;
      periodStart = project.startDate; periodEnd = project.endDate;
      selectedWorkdays = new Set(current?.days.map((day) => day.workDate) || []);
      calendarCursor = localDate(project.startDate);
      calendarCursor.setDate(1);
    } else {
      periodStart = ""; periodEnd = ""; selectedWorkdays = new Set();
      const today = new Date(); calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    }
    renderCalendar();
    document.querySelector("#project-form-status").textContent = ""; setDirty(false); show("project-form-view");
  }

  async function saveProject(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!periodStart || !periodEnd) { document.querySelector("#project-form-status").textContent = "Selecteer eerst een volledige projectperiode."; return; }
    const selected = Array.from(selectedWorkdays).sort();
    if (!selected.length) { document.querySelector("#project-form-status").textContent = "Selecteer minimaal één werkdag."; return; }
    const values = Object.fromEntries(new FormData(form)); values.id = form.dataset.projectId || undefined;
    const existing = new Map((current?.days || []).map((day) => [day.workDate, day]));
    try {
      const saved = await projects.saveProject(context.auth.user.id, values, options());
      current = await projects.replaceDays(context.auth.user.id, saved.id, selected.map((workDate) => ({
        id: existing.get(workDate)?.id || null,
        workDate,
        calculationData: existing.get(workDate)?.calculationData || defaultDayData()
      })), options());
      try {
        await rememberProjectClient();
      } catch (error) {
        console.warn("Opdrachtgever automatisch opslaan is mislukt.", error);
      }
      setDirty(false); await loadList(); await openProject(saved.id);
    } catch (error) { document.querySelector("#project-form-status").textContent = error.message || "Opslaan is niet gelukt."; }
  }

  function summaryText(result) {
    const parts = [];
    if (result.overtimeHours) parts.push(`${number.format(result.overtimeHours)} uur overwerk`);
    if (result.nightHours) parts.push(`${number.format(result.nightHours)} nachturen`);
    if (result.kilometerAmount) parts.push(`${number.format(result.kilometers)} km`);
    if (result.parkingAmount) parts.push("parkeer/onkosten");
    if (result.droneTariffAmount) parts.push("drone"); if (result.ronin4dTariffAmount) parts.push("Ronin 4D");
    result.customEquipmentItems.forEach((item) => parts.push(item.name));
    return parts.join(" · ") || "Geen toeslagen of extra kosten";
  }

  function renderOverview() {
    const project = current.project; const total = totals(current.days);
    document.querySelector("#overview-name").textContent = project.name;
    document.querySelector("#overview-meta").textContent = `${project.clientName ? `${project.clientName} · ` : ""}${formatDate(project.startDate)} - ${formatDate(project.endDate)} · ${current.days.length} werkdagen`;
    document.querySelector("#project-metrics").innerHTML = [
      ["Gewerkte uren", `${number.format(total.hours)} uur`],
      ["Overuren", `${number.format(total.overtime)} uur`], ["Nachturen", `${number.format(total.night)} uur`],
      ["Kilometers", `${number.format(total.kilometers)} km`], ["Parkeer/onkosten", euro.format(total.parking)], ["Toeslagen", euro.format(total.surcharges)],
      ["Totaal exclusief btw", euro.format(total.amount), "primary"]
    ].map(([label, value, className = ""]) => `<div class="${className}"><span>${label}</span><strong>${value}</strong></div>`).join("");
    document.querySelector("#project-day-list").innerHTML = current.days.map((day) => {
      const data = { ...defaultDayData(), ...day.calculationData }; const result = calculate(data);
      return `<button type="button" data-day-id="${day.id}"><span><strong>${formatDate(day.workDate)}</strong><small>${data.startTime} - ${data.endTime}${result.endsNextDay ? " (+1 dag)" : ""} · ${summaryText(result)}</small></span><strong>${euro.format(result.subtotalExVat)}</strong></button>`;
    }).join("");
    document.querySelectorAll("[data-day-id]").forEach((button) => button.addEventListener("click", () => openDay(button.dataset.dayId)));
    show("project-overview-view");
    requestAnimationFrame(() => {
      document.querySelector("#project-day-list").scrollLeft = 0;
      updateCarouselControls();
    });
  }

  function updateCarouselControls() {
    const carousel = document.querySelector("#project-day-list");
    const cards = carousel.querySelectorAll("[data-day-id]");
    const firstCard = cards[0];
    const gap = Number.parseFloat(getComputedStyle(carousel).columnGap) || 0;
    const step = firstCard ? firstCard.getBoundingClientRect().width + gap : carousel.clientWidth;
    const firstIndex = step ? Math.round(carousel.scrollLeft / step) : 0;
    const visible = innerWidth <= 760 ? 1 : Math.min(3, cards.length);
    const lastIndex = Math.min(cards.length, firstIndex + visible);
    document.querySelector("#carousel-position").textContent = cards.length ? `${firstIndex + 1}-${lastIndex} van ${cards.length}` : "";
    document.querySelector("#carousel-previous").disabled = carousel.scrollLeft <= 2;
    document.querySelector("#carousel-next").disabled = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 2;
  }

  function moveCarousel(direction) {
    const carousel = document.querySelector("#project-day-list");
    carousel.scrollBy({ left: direction * carousel.clientWidth, behavior: "smooth" });
  }

  async function openProject(id, dayId = "") {
    try {
      current = await projects.get(context.auth.user.id, id, options());
      if (!current) throw new Error("Project niet gevonden.");
      if (dayId && current.days.some((day) => day.id === dayId)) openDay(dayId);
      else renderOverview();
    }
    catch (error) { document.querySelector("#projects-error").textContent = error.message; document.querySelector("#projects-unavailable").hidden = false; }
  }

  function renderEquipmentOptions(data) {
    const rows = [];
    if (accountSettings.droneVisible) rows.push(["enableDroneTariff", "Drone tarief"]);
    if ((data.department || accountSettings.defaultDepartment) === "camera" && accountSettings.roninVisible) rows.push(["enableRonin4dTariff", "Ronin 4D tarief"]);
    equipment.filter((item) => item.isVisible).forEach((item) => rows.push([`equipment-${item.id}`, item.name, item]));
    document.querySelector("#project-equipment-options").innerHTML = rows.map(([name, label, item]) => `<label><input type="checkbox" name="${name}" ${item ? `data-equipment-id="${item.id}" data-equipment-name="${escapeHtml(item.name)}" data-equipment-amount="${item.amount}"` : ""}><span>${escapeHtml(label)}</span></label>`).join("");
    rows.forEach(([name, , item]) => { const input = dayForm.elements.namedItem(name); input.checked = item ? Boolean((data.customEquipment || []).find((entry) => entry.id === item.id)?.enabled) : Boolean(data[name]); });
  }

  function readDayForm() {
    const data = new FormData(dayForm); const checked = (name) => data.get(name) === "on";
    const existingDay = current?.days.find((item) => item.id === currentDayId);
    const existingData = existingDay?.calculationData || {};
    const workFunction = workFunctions.find((item) => item.id === existingData.workFunctionId)
      || workFunctions.find((item) => item.isDefault)
      || workFunctions[0];
    return {
      startTime: data.get("startTime"), endTime: data.get("endTime"), breakMinutes: Number(data.get("breakMinutes")),
      workFunctionId: workFunction?.id || existingData.workFunctionId || "",
      workFunctionName: workFunction?.name || existingData.workFunctionName || "",
      department: workFunction?.department || existingData.department || accountSettings.defaultDepartment,
      rateMode: data.get("rateMode"), rateAmount: Number(data.get("rateAmount")), normalDayHours: Number(data.get("normalDayHours")), minimumHours: Number(data.get("minimumHours")),
      enableHalfDayUnder6Hours: checked("enableHalfDayUnder6Hours"), enableOvertime10To12: checked("enableOvertime10To12"), enableOvertimeFrom12: checked("enableOvertimeFrom12"), enableOvertimeFrom14: checked("enableOvertimeFrom14"), enableNightTariff: checked("enableNightTariff"), nightStart: data.get("nightStart"), nightEnd: data.get("nightEnd"),
      enableKilometers: checked("enableKilometers"), kilometers: Number(data.get("kilometers")) || 0, kilometerRate: accountSettings.mileageRate,
      enableParkingCosts: checked("enableParkingCosts"), parkingCosts: Number(data.get("parkingCosts")) || 0,
      enableDroneTariff: checked("enableDroneTariff"), enableRonin4dTariff: checked("enableRonin4dTariff"),
      customEquipment: Array.from(document.querySelectorAll("#project-equipment-options [data-equipment-id]"), (input) => ({ id: input.dataset.equipmentId, name: input.dataset.equipmentName, amount: Number(input.dataset.equipmentAmount), enabled: input.checked }))
    };
  }

  function updateDayPreview() {
    try {
      const result = calculate(readDayForm());
      document.querySelector("#day-live-total").textContent = euro.format(result.subtotalExVat);
      document.querySelector("#day-result-strip").innerHTML = `<span><small>Gewerkt</small><strong>${number.format(result.totalHours)} uur</strong></span><span><small>Overuren</small><strong>${number.format(result.overtimeHours)} uur</strong></span><span><small>Nacht</small><strong>${number.format(result.nightHours)} uur</strong></span><span><small>Excl. btw</small><strong>${euro.format(result.subtotalExVat)}</strong></span>`;
    } catch { document.querySelector("#day-live-total").textContent = "-"; }
  }

  function buildDayInvoiceSummary(day, data, result) {
    const lines = [
      `Datum: ${day.workDate}`,
      `Tijden: ${data.startTime} tot ${data.endTime}${result.endsNextDay ? " (volgende dag)" : ""}`,
      `Totaal gewerkt: ${number.format(result.totalHours)} uur`
    ];

    if (result.overtimeHours > 0) lines.push(`Overuren: ${number.format(result.overtimeHours)} uur`);
    if (result.nightHours > 0) lines.push(`Nachturen: ${number.format(result.nightHours)} uur`);
    if (result.droneTariffAmount > 0) lines.push(`Drone tarief: ${euro.format(result.droneTariffAmount)}`);
    if (result.ronin4dTariffAmount > 0) lines.push(`Ronin 4D tarief: ${euro.format(result.ronin4dTariffAmount)}`);
    result.customEquipmentItems.forEach((item) => lines.push(`${item.name}: ${euro.format(item.amount)}`));
    if (result.kilometerAmount > 0) {
      lines.push(`Kilometers: ${number.format(result.kilometers)} km × ${euro.format(result.settings.kilometerRate)} = ${euro.format(result.kilometerAmount)}`);
    }
    if (result.parkingAmount > 0) lines.push(`Parkeer/onkosten: ${euro.format(result.parkingAmount)}`);
    lines.push(`Exclusief btw: ${euro.format(result.subtotalExVat)}`);
    return lines.join("\n");
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Kopiëren mislukt.");
  }

  async function copyDayForInvoice() {
    const day = current?.days.find((item) => item.id === currentDayId);
    if (!day) return;

    try {
      const data = readDayForm();
      const result = calculate(data);
      await writeClipboard(buildDayInvoiceSummary(day, data, result));
      sessionUi.showToast("Factuurtekst gekopieerd.");
    } catch (error) {
      sessionUi.showToast(error.message || "Kopiëren is niet gelukt.");
    }
  }

  function updateDayConditionalFields() {
    document.querySelectorAll("#day-form .conditional-field[data-for]").forEach((field) => {
      field.hidden = !dayForm.elements.namedItem(field.dataset.for).checked;
    });
    const hourly = dayForm.elements.namedItem("rateMode").value === "hour";
    dayForm.querySelector('[data-project-rate-setting="day-hours"]').hidden = hourly;
    dayForm.querySelector('[data-project-rate-setting="minimum-hours"]').hidden = !hourly;
    dayForm.querySelector('[data-project-rate-setting="half-day"]').hidden = hourly;
  }

  function openDay(id) {
    const url = new URL("index.html", location.href);
    url.searchParams.set("project", current.project.id);
    url.searchParams.set("projectDay", id);
    location.href = url.href;
  }

  async function persistDays(message) {
    current = await projects.replaceDays(context.auth.user.id, current.project.id, current.days, options());
    setDirty(false); document.querySelector("#day-form-status").textContent = message;
  }

  async function saveDay(event) {
    event.preventDefault();
    const day = current.days.find((item) => item.id === currentDayId); day.calculationData = readDayForm();
    try { await persistDays("Dag opgeslagen."); renderOverview(); } catch (error) { document.querySelector("#day-form-status").textContent = error.message; }
  }

  async function copyDay(targetIds) {
    if (!targetIds.length) { sessionUi.showToast("Selecteer minimaal één andere dag."); return; }
    if (!confirm(`De bestaande gegevens van ${targetIds.length} dag(en) worden overschreven. Doorgaan?`)) return;
    const source = readDayForm(); current.days.forEach((day) => { if (targetIds.includes(day.id)) day.calculationData = structuredClone(source); });
    try { await persistDays("Berekening gekopieerd."); sessionUi.showToast("Berekening gekopieerd."); } catch (error) { sessionUi.showToast(error.message); }
  }

  async function addNextWorkday() {
    const last = localDate(current.days.at(-1)?.workDate || current.project.endDate); do { last.setDate(last.getDate() + 1); } while ([0, 6].includes(last.getDay()));
    const workDate = isoDate(last);
    current.project.endDate = workDate > current.project.endDate ? workDate : current.project.endDate;
    try {
      await projects.saveProject(context.auth.user.id, current.project, options());
      current.days.push({ id: null, projectId: current.project.id, workDate, calculationData: defaultDayData() });
      current = await projects.replaceDays(context.auth.user.id, current.project.id, current.days, options()); renderOverview();
    } catch (error) { sessionUi.showToast(error.message); }
  }

  function printLine(label, detail, amount) { return amount ? `<div><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div><strong>${euro.format(amount)}</strong></div>` : ""; }
  function buildProjectPrint() {
    const total = totals(current.days); const p = current.project;
    const summary = `<section class="project-print-page"><header><img src="overuurtje-logo.png" alt="Overuurtje.nl"><div><p>Projectoverzicht</p><h1>${escapeHtml(p.name)}</h1></div></header><dl class="project-print-meta">${p.clientName ? `<div><dt>Opdrachtgever</dt><dd>${escapeHtml(p.clientName)}</dd></div>` : ""}<div><dt>Periode</dt><dd>${formatDate(p.startDate)} - ${formatDate(p.endDate)}</dd></div><div><dt>Werkdagen</dt><dd>${current.days.length}</dd></div>${p.notes ? `<div><dt>Notities</dt><dd>${escapeHtml(p.notes)}</dd></div>` : ""}</dl><div class="project-print-totals"><div><span>Uren</span><strong>${number.format(total.hours)}</strong></div><div><span>Overuren</span><strong>${number.format(total.overtime)}</strong></div><div><span>Nachturen</span><strong>${number.format(total.night)}</strong></div><div><span>Kilometers</span><strong>${number.format(total.kilometers)}</strong></div><div><span>Parkeren</span><strong>${euro.format(total.parking)}</strong></div><div><span>Toeslagen</span><strong>${euro.format(total.surcharges)}</strong></div><div class="grand"><span>Totaal excl. btw</span><strong>${euro.format(total.amount)}</strong></div></div><footer>Powered by Reichgelt Media Group</footer></section>`;
    const pages = current.days.map((day) => {
      const data = { ...defaultDayData(), ...day.calculationData }; const r = calculate(data);
      const lines = [
        printLine(
          data.rateMode === "hour" && r.minimumChargeApplied ? "Minimale afname" : "Basistarief",
          data.rateMode === "hour"
            ? `${number.format(r.regularHours)} uur × ${euro.format(r.hourlyRate)}${r.minimumChargeApplied ? ` + ${euro.format(r.minimumAdjustmentAmount)} minimumcorrectie tot ${number.format(r.minimumHours)} uur` : ""}`
            : `Dagtarief ${euro.format(data.rateAmount)}`,
          r.baseAmount
        ),
        printLine("Overuren 100%", `${number.format(r.standardOvertimeHours)} uur × ${euro.format(r.hourlyRate)} × 100%`, r.standardOvertimeAmount),
        printLine("Overuren 150%", `${number.format(r.overtime10To12Hours)} uur × ${euro.format(r.hourlyRate)} × 150%`, r.overtime10To12Amount),
        printLine("Overuren 200%", `${number.format(r.overtimeFrom12Hours)} uur × ${euro.format(r.hourlyRate)} × 200%`, r.overtimeFrom12Amount),
        printLine("Overuren 250%", `${number.format(r.overtimeFrom14Hours)} uur × ${euro.format(r.hourlyRate)} × 250%`, r.overtimeFrom14Amount),
        printLine("Pure nachturen", `${number.format(r.pureNightHours)} uur × ${euro.format(r.hourlyRate)} × 100% nachttoeslag`, r.pureNightAmount),
        ...r.nightOvertimeSurchargeBreakdown.map((item) => printLine("Nachttoeslag over overuren", `${number.format(item.hours)} uur × ${euro.format(r.hourlyRate)} × ${number.format(item.surchargeFactor * 100)}%`, item.amount)),
        printLine("Drone", "Vaste toeslag", r.droneTariffAmount), printLine("Ronin 4D", "Vaste toeslag", r.ronin4dTariffAmount),
        ...r.customEquipmentItems.map((item) => printLine(item.name, "Vaste apparatuurtoeslag", item.amount)),
        printLine("Kilometers", `${number.format(r.kilometers)} km × ${euro.format(r.settings.kilometerRate)}`, r.kilometerAmount),
        printLine("Parkeer/onkosten", "Ingevoerd bedrag", r.parkingAmount)
      ].join("");
      return `<section class="project-print-page"><header><img src="overuurtje-logo.png" alt=""><div><p>Projectdag · ${escapeHtml(p.name)}</p><h1>${formatDate(day.workDate)}</h1></div></header><dl class="project-print-meta">${data.workFunctionName ? `<div><dt>Functie</dt><dd>${escapeHtml(data.workFunctionName)}</dd></div>` : ""}<div><dt>Tijden</dt><dd>${data.startTime} - ${data.endTime}${r.endsNextDay ? " (+1 dag)" : ""}</dd></div>${data.breakMinutes ? `<div><dt>Pauze</dt><dd>${data.breakMinutes} minuten</dd></div>` : ""}<div><dt>Gewerkt</dt><dd>${number.format(r.totalHours)} uur</dd></div></dl><div class="project-print-lines">${lines}</div><div class="project-print-invoice"><span>Totaal excl. btw</span><strong>${euro.format(r.subtotalExVat)}</strong><span>Btw 21%</span><strong>${euro.format(r.vatAmount)}</strong><span>Inclusief btw</span><strong>${euro.format(r.totalIncVat)}</strong></div><footer>Powered by Reichgelt Media Group</footer></section>`;
    }).join("");
    document.querySelector("#project-print-root").innerHTML = summary + pages;
  }

  async function initialize(userContext) {
    const contextKey = `${userContext.auth.user?.id || "guest"}:${userContext.subscription.status}:${location.search}`;
    if (contextKey === initializedContextKey) return;
    initializedContextKey = contextKey;
    context = userContext;
    const pro = Boolean(context.auth.user && featureGate.canUse("projects", { isPro: context.subscription.isPro }));
    document.querySelector("#projects-locked").hidden = pro;
    document.querySelector("#new-project").hidden = !pro;
    views.forEach((id) => { document.querySelector(`#${id}`).hidden = true; });
    if (context.auth.user) {
      try { await loadSharedProjects(); }
      catch (error) { document.querySelector("#projects-unavailable").hidden = false; document.querySelector("#projects-error").textContent = error.message; }
    } else {
      sharedProjects = [];
      renderSharedProjects();
    }
    await loadProjectInvite();
    if (!pro) return;
    try {
      const [settingsResult, functionsResult, equipmentResult] = await Promise.allSettled([
        settingsService.load(context.auth.user.id),
        functionService.list(context.auth.user.id),
        equipmentService.list(context.auth.user.id)
      ]);
      accountSettings = { ...settingsService.defaults, ...(settingsResult.status === "fulfilled" ? (settingsResult.value || {}) : {}) };
      renderClientSuggestions();
      workFunctions = functionsResult.status === "fulfilled" ? functionsResult.value : [];
      equipment = equipmentResult.status === "fulfilled" ? equipmentResult.value : [];
      await loadList();
    } catch (error) { document.querySelector("#projects-unavailable").hidden = false; document.querySelector("#projects-error").textContent = error.message; }
  }

  document.querySelector("#new-project").addEventListener("click", () => openProjectForm());
  document.querySelector("#share-project").addEventListener("click", () => {
    if (current?.project.id) shareUi?.open({ sourceType: "project", sourceId: current.project.id });
  });
  form.addEventListener("submit", saveProject); form.addEventListener("input", () => setDirty(true));
  document.querySelector("#calendar-grid").addEventListener("click", (event) => {
    const day = event.target.closest("[data-calendar-date]");
    if (day) chooseCalendarDate(day.dataset.calendarDate);
  });
  document.querySelector("#calendar-previous").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar();
  });
  document.querySelector("#calendar-next").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar();
  });
  document.querySelector("#calendar-reset").addEventListener("click", () => {
    periodStart = ""; periodEnd = ""; selectedWorkdays.clear(); setDirty(true); renderCalendar();
  });
  document.querySelector("#calendar-weekdays-only").addEventListener("click", () => {
    selectedWorkdays = new Set(dateRange(periodStart, periodEnd).filter((iso) => ![0, 6].includes(localDate(iso).getDay())));
    setDirty(true); renderCalendar();
  });
  document.querySelector("#calendar-clear-days").addEventListener("click", () => {
    selectedWorkdays.clear(); setDirty(true); renderCalendar();
  });
  document.querySelector("#cancel-project").addEventListener("click", () => {
    if (dirty && !confirm("Niet-opgeslagen wijzigingen verlaten?")) return;
    setDirty(false);
    if (current) renderOverview(); else renderProjectList();
  });
  document.querySelector("#edit-project").addEventListener("click", () => openProjectForm(current.project));
  document.querySelector("#back-to-projects").addEventListener("click", renderProjectList);
  document.querySelector("#delete-project").addEventListener("click", async () => { if (!confirm(`Project “${current.project.name}” en alle werkdagen verwijderen?`)) return; await projects.remove(context.auth.user.id, current.project.id, options()); current = null; await loadList(); });
  document.querySelector("#add-next-workday").addEventListener("click", addNextWorkday);
  document.querySelector("#carousel-previous").addEventListener("click", () => moveCarousel(-1));
  document.querySelector("#carousel-next").addEventListener("click", () => moveCarousel(1));
  document.querySelector("#project-day-list").addEventListener("scroll", updateCarouselControls, { passive: true });
  addEventListener("resize", updateCarouselControls);
  dayForm.addEventListener("submit", saveDay);
  dayForm.addEventListener("input", () => { setDirty(true); updateDayConditionalFields(); updateDayPreview(); });
  document.querySelector("#cancel-day").addEventListener("click", () => { if (!dirty || confirm("Niet-opgeslagen wijzigingen verlaten?")) { setDirty(false); renderOverview(); } });
  document.querySelector("#copy-all-days").addEventListener("click", () => copyDay(current.days.filter((day) => day.id !== currentDayId).map((day) => day.id)));
  document.querySelector("#copy-selected-days").addEventListener("click", () => copyDay(Array.from(document.querySelectorAll("#copy-day-targets input:checked"), (input) => input.value)));
  document.querySelector("#copy-day-invoice").addEventListener("click", copyDayForInvoice);
  document.querySelector("#share-project-day").addEventListener("click", () => {
    if (currentDayId) shareUi?.open({ sourceType: "project_day", sourceId: currentDayId });
  });
  document.querySelector("#project-pdf").addEventListener("click", () => { buildProjectPrint(); window.print(); });
  sharedProjectDialog.querySelector("[data-shared-project-close]").addEventListener("click", () => closeDialog(sharedProjectDialog));
  projectInviteDialog.querySelector("[data-project-invite-close]").addEventListener("click", () => closeDialog(projectInviteDialog));
  projectInviteDialog.querySelector("[data-project-invite-login]").addEventListener("click", () => {
    closeDialog(projectInviteDialog);
    sessionUi.openAuth("login", { purpose: "share" });
  });
  projectInviteDialog.querySelector("[data-project-invite-register]").addEventListener("click", () => {
    closeDialog(projectInviteDialog);
    sessionUi.openAuth("register", { purpose: "share" });
  });
  projectInviteDialog.querySelector("[data-project-invite-accept]").addEventListener("click", acceptProjectInvite);
  addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  document.addEventListener("overuurtje:user-context", (event) => initialize(event.detail));
  sessionUi.ready.then(initialize);
})();
