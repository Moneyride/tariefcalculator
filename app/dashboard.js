(function initializeDashboard() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const workdays = globalThis.OveruurtjeWorkdays;
  const projects = globalThis.OveruurtjeProjects;
  const badges = globalThis.OveruurtjeBadges;
  const statsEngine = globalThis.OveruurtjeStats;
  const calculator = globalThis.TariffCalculator;
  const guest = document.querySelector("#dashboard-guest");
  const content = document.querySelector("#dashboard-content");
  const freeNote = document.querySelector("#dashboard-free-note");
  const number = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });
  const dateShort = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  let loadedContextKey = "";

  function projectResult(data) {
    return calculator.calculateTariff({
      ...data,
      hourlyRate: data.rateMode === "hour" ? data.rateAmount : undefined
    }, {
      ...calculator.DEFAULT_SETTINGS,
      dayRate: data.rateMode === "day" ? data.rateAmount : calculator.DEFAULT_SETTINGS.dayRate,
      normalDayHours: Number(data.normalDayHours) || 10,
      minimumHours: Number.isFinite(Number(data.minimumHours)) ? Number(data.minimumHours) : 1,
      enableHalfDayUnder6Hours: Boolean(data.enableHalfDayUnder6Hours),
      enableOvertime10To12: Boolean(data.enableOvertime10To12),
      enableOvertimeFrom12: Boolean(data.enableOvertimeFrom12),
      enableOvertimeFrom14: Boolean(data.enableOvertimeFrom14),
      enableNightTariff: Boolean(data.enableNightTariff),
      nightStart: data.nightStart || "00:00",
      nightEnd: data.nightEnd || "06:00"
    });
  }

  function workdayResult(snapshot) {
    if (snapshot.result) return snapshot.result;
    const settings = snapshot.settings || {};
    return calculator.calculateTariff({
      startTime: snapshot.startTime,
      endTime: snapshot.endTime,
      breakMinutes: snapshot.breakMinutes,
      rateMode: settings.rateMode,
      hourlyRate: settings.hourlyRate,
      ...(snapshot.extras || {})
    }, settings);
  }

  function recordFromWorkday(item) {
    const snapshot = item.calculationData || {};
    if (!snapshot.endTime) return { id: item.id, type: "workday", date: item.workDate, startTime: snapshot.startTime, endTime: "" };
    const result = workdayResult(snapshot);
    return {
      id: item.id,
      type: "workday",
      date: item.workDate,
      startTime: snapshot.startTime,
      endTime: snapshot.endTime,
      totalHours: result.totalHours,
      overtimeHours: result.overtimeHours,
      nightHours: result.nightHours
    };
  }

  function recordFromProject(entry) {
    const data = entry.day.calculationData || {};
    if (!data.endTime) {
      return { id: entry.day.id, projectId: entry.project.id, type: "project", date: entry.day.workDate, startTime: data.startTime, endTime: "" };
    }
    const result = projectResult(data);
    return {
      id: entry.day.id,
      projectId: entry.project.id,
      type: "project",
      date: entry.day.workDate,
      startTime: data.startTime,
      endTime: data.endTime,
      totalHours: result.totalHours,
      overtimeHours: result.overtimeHours,
      nightHours: result.nightHours
    };
  }

  const hours = (value) => `${number.format(Number(value) || 0)} uur`;
  const dateLabel = (value) => value ? dateShort.format(statsEngine.parseDate(value)) : "";

  function setPeriod(scope, values) {
    document.querySelector(`[data-${scope}="workdays"]`).textContent = number.format(values.workdays);
    document.querySelector(`[data-${scope}="hours"]`).textContent = hours(values.hours);
    document.querySelector(`[data-${scope}="overtime"]`).textContent = hours(values.overtime);
    document.querySelector(`[data-${scope}="night"]`).textContent = hours(values.night);
  }

  function setPersonal(name, value, detail = "") {
    document.querySelector(`[data-personal="${name}"]`).textContent = value || "-";
    document.querySelector(`[data-personal-detail="${name}"]`).textContent = detail;
  }

  function renderStats(records) {
    const stats = statsEngine.calculate(records);
    setPeriod("week", stats.week);
    setPeriod("month", stats.month);
    setPersonal("longestDay", stats.personal.longestDay ? hours(stats.personal.longestDay.totalHours) : "-", dateLabel(stats.personal.longestDay?.date));
    setPersonal("earliestStart", stats.personal.earliestStart?.record.startTime || "-", dateLabel(stats.personal.earliestStart?.record.date));
    setPersonal("latestEnd", stats.personal.latestEnd?.record.endTime || "-", dateLabel(stats.personal.latestEnd?.record.date));
    setPersonal("mostOvertime", stats.personal.mostOvertime ? hours(stats.personal.mostOvertime.overtimeHours) : "-", dateLabel(stats.personal.mostOvertime?.date));
    setPersonal("bestWeek", stats.personal.bestWeek ? hours(stats.personal.bestWeek.hours) : "-", stats.personal.bestWeek ? `Week van ${dateLabel(stats.personal.bestWeek.week)}` : "");
  }

  function renderPeriodLabels(now = new Date()) {
    const weekStart = statsEngine.startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    document.querySelector("#dashboard-week-range").textContent = `${dateShort.format(weekStart)} – ${dateShort.format(weekEnd)}`;
    document.querySelector("#dashboard-month-name").textContent = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(now);
  }

  function renderActive(records) {
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const active = records.find((record) => record.date === todayValue && !record.endTime);
    const link = document.querySelector("#dashboard-active-workday");
    link.hidden = !active;
    if (!active) return;
    if (active.type === "project") {
      link.href = `index.html?project=${encodeURIComponent(active.projectId)}&projectDay=${encodeURIComponent(active.id)}`;
      document.querySelector("#dashboard-active-title").textContent = "Verder met projectdag van vandaag";
    } else {
      link.href = `index.html?workday=${encodeURIComponent(active.id)}`;
      document.querySelector("#dashboard-active-title").textContent = "Verder met werkdag van vandaag";
    }
  }

  function openDialog(dialog) {
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function renderBadgeItem(item, { compact = false, selectable = false } = {}) {
    const element = document.createElement(selectable ? "button" : "article");
    element.className = `crew-badge ${item.earnedAt ? "is-earned" : "is-locked"}${item.selected ? " is-selected" : ""}${compact ? " is-compact" : ""}`;
    if (selectable) {
      element.type = "button";
      element.disabled = !item.earnedAt;
      element.dataset.badgeKey = item.key;
    }
    const title = item.hidden && !item.earnedAt ? "Verborgen badge" : item.name;
    const description = item.hidden && !item.earnedAt ? "Blijf registreren om deze te ontdekken." : item.description;
    element.innerHTML = `<span class="crew-badge-icon">${item.earnedAt ? item.icon : "?"}</span><span><strong>${title}</strong>${compact ? "" : `<small>${description}</small>`}</span>`;
    return element;
  }

  function renderCrewCard(card, collection) {
    if (!card) return;
    const displayName = card.displayName || "Crewlid";
    document.querySelector("#crew-card-name").textContent = displayName;
    document.querySelector("#crew-card-initial").textContent = displayName.slice(0, 1).toUpperCase();
    document.querySelector("#crew-card-member-since").textContent = `Lid sinds ${card.memberSince || "-"}`;
    document.querySelector("#crew-card-workdays").textContent = number.format(card.registeredWorkdays || 0);
    document.querySelector("#crew-card-badges").textContent = `${number.format(card.badgeCount || 0)} badges behaald`;
    document.querySelector("#crew-card-crew").textContent = number.format(card.crewCount || 0);
    const recent = document.querySelector("#crew-card-recent-badges");
    const recentKeys = new Set((card.recentBadges || []).map((badge) => badge.key));
    const items = collection.filter((badge) => recentKeys.has(badge.key)).slice(0, 4);
    recent.replaceChildren(...items.map((badge) => renderBadgeItem(badge, { compact: true })));
    recent.hidden = items.length === 0;

    const overview = document.querySelector("#dashboard-badge-list");
    const visible = collection.filter((badge) => !badge.hidden).slice(0, 5);
    overview.replaceChildren(...visible.map((badge) => renderBadgeItem(badge)));
  }

  function showNewBadge(awards) {
    const badge = awards?.[0];
    if (!badge) return;
    sessionUi.showToast(`${badge.icon} Badge behaald: ${badge.name}`);
  }

  async function loadCrewCard() {
    if (!badges) return;
    try {
      const awards = await badges.evaluate();
      const [card, collection] = await Promise.all([badges.getCrewCard(), badges.list()]);
      renderCrewCard(card, collection);
      showNewBadge(awards);
    } catch (error) {
      console.warn("Crew Card kon niet worden geladen.", error);
    }
  }

  async function render(context) {
    const user = context.auth.user;
    guest.hidden = Boolean(user);
    content.hidden = !user;
    if (!user) {
      loadedContextKey = "";
      return;
    }

    const key = `${user.id}:${context.isPro}`;
    if (loadedContextKey === key) return;
    loadedContextKey = key;
    freeNote.hidden = context.isPro;
    renderPeriodLabels();
    await loadCrewCard();

    if (!context.isPro) {
      renderStats([]);
      renderActive([]);
      return;
    }

    try {
      const options = { mock: context.subscription.isMock };
      const [savedWorkdays, projectDays] = await Promise.all([
        workdays.list(user.id, options),
        projects.listAllDays(user.id, options)
      ]);
      const records = [
        ...savedWorkdays.map(recordFromWorkday),
        ...projectDays.map(recordFromProject)
      ];
      renderStats(records);
      renderActive(records);
    } catch (error) {
      console.warn("Dashboard kon niet worden geladen.", error);
      sessionUi.showToast("Je dashboard kon niet volledig worden geladen.");
    }
  }

  document.querySelector("#dashboard-login")?.addEventListener("click", () => sessionUi.openAuth("login"));
  const badgeDialog = document.querySelector("#crew-badge-dialog");
  async function openBadgeCollection() {
    if (!badges) return;
    try {
      const collection = await badges.list();
      const list = document.querySelector("#crew-badge-collection");
      list.replaceChildren(...collection.map((badge) => renderBadgeItem(badge, { selectable: true })));
      openDialog(badgeDialog);
    } catch (error) {
      sessionUi.showToast(error.message || "Badges konden niet worden geladen.");
    }
  }
  document.querySelector("#crew-card-collection")?.addEventListener("click", openBadgeCollection);
  document.querySelector("#dashboard-badges-all")?.addEventListener("click", openBadgeCollection);
  document.querySelector("[data-crew-badge-close]")?.addEventListener("click", () => closeDialog(badgeDialog));
  document.querySelector("#crew-badge-collection")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-key]");
    if (!button || button.disabled) return;
    try {
      await badges.select(button.dataset.badgeKey);
      await loadCrewCard();
      await openBadgeCollection();
      sessionUi.showToast("Badge gekozen voor je Crew Card.");
    } catch (error) {
      sessionUi.showToast(error.message || "Badge kiezen is niet gelukt.");
    }
  });
  document.addEventListener("overuurtje:user-context", (event) => render(event.detail));
  sessionUi.ready.then(render);
})();
