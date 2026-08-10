(function initializeDashboard() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const workdays = globalThis.OveruurtjeWorkdays;
  const projects = globalThis.OveruurtjeProjects;
  const badges = globalThis.OveruurtjeBadges;
  const config = globalThis.OveruurtjeConfig;
  const statsEngine = globalThis.OveruurtjeStats;
  const calculator = globalThis.TariffCalculator;
  const guest = document.querySelector("#dashboard-guest");
  const content = document.querySelector("#dashboard-content");
  const freeNote = document.querySelector("#dashboard-free-note");
  const number = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });
  const dateShort = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  const BADGE_SIMULATION_KEY = "overuurtjeDevAllBadges";
  const BADGE_SIMULATION_SELECTION_KEY = "overuurtjeDevSelectedBadge";
  const BADGE_SIMULATION_FEATURED_KEY = "overuurtjeDevFeaturedBadges";
  const DEV_BADGE_CATALOG = [
    ["eerste_draaidag", "Eerste Draaidag", "Je eerste werkdag is geregistreerd.", "🎬", false],
    ["productieveteraan", "Productieveteraan", "100 werkdagen geregistreerd.", "🎥", false],
    ["nachtraaf", "Nachtraaf", "Je eerste werkdag eindigde na middernacht.", "🌙", false],
    ["drukke_maand", "Drukke Maand", "20 werkdagen in één kalendermaand.", "🔥", false],
    ["road_warrior", "Road Warrior", "10.000 zakelijke kilometers geregistreerd.", "🚗", false],
    ["first_call", "First Call", "Je eerste call was vóór 06:00.", "⏰", false],
    ["teamspeler", "Teamspeler", "Je eerste gedeelde werkdag is geaccepteerd.", "🤝", false],
    ["crew_builder", "Crew Builder", "Een uitgenodigde collega deed mee.", "📤", false],
    ["eerste_productie", "Eerste Productie", "Je eerste project is afgerond.", "📂", false],
    ["buitenlandklus", "Buitenlandklus", "Je eerste reisdag buiten Europa.", "🌍", false],
    ["setlegende", "Setlegende", "500 werkdagen geregistreerd.", "🏆", true],
    ["sunrise_crew", "Sunrise Crew", "Je begon vóór 05:00.", "🌅", true],
    ["vroege_vogel", "Vroege Vogel", "25 werkdagen begonnen vóór 07:00.", "☕", true],
    ["nachtuil", "Nachtuil", "25 werkdagen eindigden na middernacht.", "🦉", true],
    ["frequent_flyer", "Frequent Flyer", "10 reisdagen buiten Europa.", "✈️", true],
    ["thats_a_wrap", "That's a Wrap", "100 werkdagen volledig afgerond.", "🎬", true],
    ["volle_week", "Volle Week", "5 werkdagen in één maandag-zondagweek.", "🗓️", true],
    ["iedereen_kent_iedereen", "Iedereen Kent Iedereen", "Met 10 verschillende collega's samengewerkt.", "👥", true],
    ["vaste_crew", "Vaste Crew", "25 gedeelde werkdagen met dezelfde collega.", "🫂", true],
    ["long_runner", "Long Runner", "Een project met minimaal 10 werkdagen afgerond.", "🎞️", true],
    ["paperwork_hero", "Paperwork Hero", "Je eerste uitgebreide PDF is gemaakt.", "📄", true],
    ["back_to_back", "Back to Back", "Minder dan 8 uur tussen twee werkdagen.", "🏃", true],
    ["kerstcrew", "Kerstcrew", "Gewerkt op eerste of tweede kerstdag.", "🎄", true],
    ["new_years_crew", "New Year's Crew", "Gewerkt over de jaarwisseling.", "🎆", true],
    ["langste_dag", "Langste Dag", "Gewerkt op 21 juni.", "☀️", true],
    ["kortste_dag", "Kortste Dag", "Gewerkt op 21 december.", "🌑", true],
    ["jubileum", "Jubileum", "Je account bestaat één jaar.", "🎂", true],
    ["launch_crew", "Launch Crew", "Je was erbij in het eerste jaar.", "🚀", true],
    ["reken_check_klaar", "Reken, check, klaar.", "100 berekeningen gemaakt.", "🧮", true],
    ["geen_negen_tot_vijf", "Geen 9-tot-5", "Begonnen vóór 09:00 en geëindigd na 17:00.", "🧳", true]
  ].map(([key, name, description, icon, hidden]) => ({ key, name, description, icon, hidden }));
  let loadedContextKey = "";
  let currentProfile = null;
  let currentRecords = [];

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

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function canSimulateBadges() {
    return Boolean(config?.allowMockSubscriptions || ["localhost", "127.0.0.1"].includes(location.hostname));
  }

  function isBadgeSimulationEnabled() {
    if (!canSimulateBadges()) return false;
    try {
      return localStorage.getItem(BADGE_SIMULATION_KEY) === "true";
    } catch {
      return false;
    }
  }

  function setBadgeSimulation(enabled) {
    try {
      localStorage.setItem(BADGE_SIMULATION_KEY, enabled ? "true" : "false");
    } catch {}
  }

  function simulatedBadgeSelection() {
    try {
      return localStorage.getItem(BADGE_SIMULATION_SELECTION_KEY) || "";
    } catch {
      return "";
    }
  }

  function simulatedFeaturedBadges() {
    try {
      const value = JSON.parse(localStorage.getItem(BADGE_SIMULATION_FEATURED_KEY) || "[]");
      return Array.isArray(value) ? value.filter(Boolean).slice(0, 3) : [];
    } catch {
      return [];
    }
  }

  function storeSimulatedSelection(keys, titleKey) {
    try {
      const featuredKeys = keys.slice(0, 3);
      const validTitleKey = featuredKeys.includes(titleKey) ? titleKey : featuredKeys[0] || "";
      localStorage.setItem(BADGE_SIMULATION_FEATURED_KEY, JSON.stringify(featuredKeys));
      localStorage.setItem(BADGE_SIMULATION_SELECTION_KEY, validTitleKey);
    } catch {}
  }

  function decorateBadgeCollection(collection) {
    if (!isBadgeSimulationEnabled()) return collection;
    const actual = new Map(collection.map((item) => [item.key, item]));
    let featuredKeys = simulatedFeaturedBadges();
    if (!featuredKeys.length) {
      featuredKeys = collection.filter((item) => item.featured).sort((a, b) => (a.featuredPosition || 99) - (b.featuredPosition || 99)).map((item) => item.key).slice(0, 3);
    }
    const storedTitleKey = simulatedBadgeSelection() || collection.find((item) => item.title)?.key || "";
    const titleKey = featuredKeys.includes(storedTitleKey) ? storedTitleKey : featuredKeys[0] || "";
    return DEV_BADGE_CATALOG.map((badge) => ({
      ...badge,
      ...(actual.get(badge.key) || {}),
      hidden: badge.hidden,
      earnedAt: actual.get(badge.key)?.earnedAt || "development-simulation",
      featured: featuredKeys.includes(badge.key),
      featuredPosition: featuredKeys.indexOf(badge.key) + 1 || null,
      title: badge.key === titleKey
    }));
  }

  function decorateCrewCard(card, collection, records = currentRecords, profile = currentProfile) {
    const title = collection.find((badge) => badge.title);
    const featured = collection.filter((badge) => badge.featured).sort((a, b) => (a.featuredPosition || 99) - (b.featuredPosition || 99)).slice(0, 3);
    const fallback = {
      registeredWorkdays: Array.isArray(records) ? records.length : 0,
      badgeCount: collection.filter((badge) => badge.earnedAt).length,
      memberSince: profile?.createdAt || ""
    };
    if (!isBadgeSimulationEnabled()) {
      return {
        ...fallback,
        ...(card || {}),
        registeredWorkdays: Number(card?.registeredWorkdays) || fallback.registeredWorkdays,
        badgeCount: Number(card?.badgeCount) || fallback.badgeCount,
        memberSince: card?.memberSince || fallback.memberSince,
        selectedBadge: title ? { key: title.key, name: title.name, icon: title.icon } : card?.selectedBadge,
        featuredBadges: featured.length
          ? featured.map((badge) => ({ key: badge.key, name: badge.name, description: badge.description, icon: badge.icon }))
          : (card?.featuredBadges || [])
      };
    }
    return {
      ...(card || {}),
      registeredWorkdays: Array.isArray(records) ? records.length : Number(card?.registeredWorkdays) || 0,
      badgeCount: collection.filter((badge) => badge.earnedAt).length,
      memberSince: card?.memberSince || fallback.memberSince,
      selectedBadge: title ? { key: title.key, name: title.name, icon: title.icon } : card?.selectedBadge,
      featuredBadges: featured.map((badge) => ({ key: badge.key, name: badge.name, description: badge.description, icon: badge.icon }))
    };
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

  function renderBadgeItem(item, { compact = false, controls = false } = {}) {
    const element = document.createElement("article");
    element.className = `crew-badge ${item.earnedAt ? "is-earned" : "is-locked"}${item.featured ? " is-featured" : ""}${item.title ? " is-title" : ""}${compact ? " is-compact" : ""}`;
    const title = item.hidden && !item.earnedAt ? "Verborgen badge" : item.name;
    const description = item.hidden && !item.earnedAt ? "Blijf registreren om deze te ontdekken." : item.description;
    element.innerHTML = `<span class="crew-badge-icon">${item.earnedAt ? item.icon : "?"}</span><span class="crew-badge-copy"><strong>${title}</strong>${compact ? "" : `<small>${description}</small>`}</span>`;
    if (controls && item.earnedAt) {
      const actions = document.createElement("div");
      actions.className = "crew-badge-actions";
      actions.innerHTML = `
        <button type="button" data-badge-action="feature" data-badge-key="${item.key}" aria-pressed="${item.featured}">${item.featured ? "Op Crew Card" : "Uitlichten"}</button>
        <button type="button" data-badge-action="title" data-badge-key="${item.key}" aria-pressed="${item.title}" ${item.featured ? "" : "disabled"}>${item.title ? "Titelbadge" : "Als titel"}</button>`;
      element.append(actions);
    }
    return element;
  }

  function renderCrewCard(card, collection, profile = null) {
    const displayName = card?.displayName || profile?.displayName || "Jij";
    document.querySelector("#crew-card-name").textContent = displayName;
    const initial = document.querySelector("#crew-card-initial");
    const avatar = document.querySelector("#crew-card-avatar-image");
    initial.textContent = displayName.slice(0, 1).toUpperCase();
    const avatarUrl = card?.avatarUrl || profile?.avatarUrl || "";
    if (avatarUrl) {
      avatar.src = avatarUrl;
      avatar.hidden = false;
      initial.hidden = true;
    } else {
      avatar.hidden = true;
      initial.hidden = false;
    }
    const memberSince = card?.memberSince
      ? new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date(`${card.memberSince}T12:00:00`))
      : "-";
    document.querySelector("#crew-card-member-since").textContent = `Lid sinds ${memberSince}`;
    document.querySelector("#crew-card-status").textContent = card?.selectedBadge?.name || "Crewlid";
    document.querySelector("#crew-card-workdays").textContent = number.format(card?.registeredWorkdays || 0);
    document.querySelector("#crew-card-badges").textContent = number.format(card?.badgeCount || 0);
    document.querySelector("#crew-card-crew").textContent = number.format(card?.crewCount || 0);
    const featuredBadges = collection
      .filter((badge) => badge.earnedAt && badge.featured)
      .sort((a, b) => (a.featuredPosition || 99) - (b.featuredPosition || 99))
      .slice(0, 3);
    const recent = document.querySelector("#crew-card-recent-badges");
    recent.replaceChildren(...featuredBadges.map((badge) => renderBadgeItem(badge, { compact: true })));
    recent.hidden = featuredBadges.length === 0;
  }

  function showNewBadge(awards) {
    if (!awards?.length) return;
    const labels = awards.map((badge) => `${badge.icon} ${badge.name}`);
    sessionUi.showToast(`Badge${labels.length === 1 ? "" : "s"} behaald: ${labels.join(" · ")}`);
  }

  async function loadCrewCard(profile = currentProfile, records = currentRecords) {
    if (!badges) {
      const collection = decorateBadgeCollection([]);
      renderCrewCard(decorateCrewCard(null, collection, records, profile), collection, profile);
      return;
    }
    const evaluation = await badges.evaluate()
      .then((value) => ({ status: "fulfilled", value }))
      .catch((reason) => ({ status: "rejected", reason }));
    const [cardResult, listResult] = await Promise.allSettled([
      badges.getCrewCard(),
      badges.list()
    ]);
    if (evaluation.status === "rejected") console.warn("Badgecontrole kon niet worden uitgevoerd.", evaluation.reason);
    if (cardResult.status === "rejected") console.warn("Crew Card kon niet worden geladen.", cardResult.reason);
    if (listResult.status === "rejected") console.warn("Badges konden niet worden geladen.", listResult.reason);
    const collection = decorateBadgeCollection(listResult.status === "fulfilled" ? listResult.value : []);
    const card = cardResult.status === "fulfilled" ? cardResult.value : null;
    renderCrewCard(decorateCrewCard(card, collection, records, profile), collection, profile);
    if (evaluation.status === "fulfilled") showNewBadge(evaluation.value);
  }

  async function render(context) {
    const user = context.auth.user;
    currentProfile = context.profile || null;
    guest.hidden = Boolean(user);
    content.hidden = !user;
    if (!user) {
      loadedContextKey = "";
      currentRecords = [];
      return;
    }

    const key = `${user.id}:${context.isPro}`;
    if (loadedContextKey === key) {
      await loadCrewCard(context.profile, currentRecords);
      return;
    }
    loadedContextKey = key;
    freeNote.hidden = context.isPro;
    renderPeriodLabels();

    if (!context.isPro) {
      currentRecords = [];
      renderStats([]);
      renderActive([]);
      await loadCrewCard(context.profile, currentRecords);
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
      currentRecords = records;
      renderStats(records);
      renderActive(records);
      await loadCrewCard(context.profile, records);
    } catch (error) {
      console.warn("Crew Card kon niet volledig worden geladen.", error);
      sessionUi.showToast("Je Crew Card kon niet volledig worden geladen.");
      await loadCrewCard(context.profile, currentRecords);
    }
  }

  document.querySelector("#dashboard-login")?.addEventListener("click", () => sessionUi.openAuth("login"));
  const badgeDialog = document.querySelector("#crew-badge-dialog");
  const badgeSimulation = document.querySelector("#crew-badge-simulation");
  const badgeDevToggle = document.querySelector("#crew-badge-dev-toggle");
  badgeDevToggle.hidden = !canSimulateBadges();
  badgeSimulation.checked = isBadgeSimulationEnabled();

  async function populateBadgeCollection() {
    if (!badges && !isBadgeSimulationEnabled()) {
      sessionUi.showToast("Badges zijn nog niet beschikbaar.");
      return;
    }

    const list = document.querySelector("#crew-badge-collection");
    list.replaceChildren();
    try {
      const storedCollection = badges ? await badges.list() : [];
      const collection = decorateBadgeCollection(storedCollection);
      if (!collection.length) {
        const empty = document.createElement("p");
        empty.className = "crew-badge-empty";
        empty.textContent = "Je hebt nog geen badges behaald. Sla je eerste werkdag op om te beginnen.";
        list.replaceChildren(empty);
        return;
      }
      list.replaceChildren(...collection.map((badge) => renderBadgeItem(badge, { controls: true })));
    } catch (error) {
      const collection = decorateBadgeCollection([]);
      if (collection.length) {
        list.replaceChildren(...collection.map((badge) => renderBadgeItem(badge, { controls: true })));
        return;
      }
      const empty = document.createElement("p");
      empty.className = "crew-badge-empty";
      empty.textContent = "Je badges konden niet worden geladen. Controleer of de Crew Card-migration in Supabase is uitgevoerd.";
      list.replaceChildren(empty);
      sessionUi.showToast(error.message || "Badges konden niet worden geladen.");
    }
  }

  async function openBadgeCollection() {
    openDialog(badgeDialog);
    await populateBadgeCollection();
  }

  async function updateBadgeSelection(key, action) {
    const storedCollection = badges ? await badges.list() : [];
    const collection = decorateBadgeCollection(storedCollection);
    const item = collection.find((badge) => badge.key === key);
    if (!item?.earnedAt) return;
    let featuredKeys = collection.filter((badge) => badge.featured).sort((a, b) => (a.featuredPosition || 99) - (b.featuredPosition || 99)).map((badge) => badge.key).slice(0, 3);
    const storedTitleKey = collection.find((badge) => badge.title)?.key || "";
    let titleKey = featuredKeys.includes(storedTitleKey) ? storedTitleKey : featuredKeys[0] || "";

    if (action === "feature") {
      if (featuredKeys.includes(key)) {
        featuredKeys = featuredKeys.filter((value) => value !== key);
        if (titleKey === key) titleKey = featuredKeys[0] || "";
      } else {
        if (featuredKeys.length >= 3) {
          sessionUi.showToast("Je kunt maximaal drie badges uitlichten.");
          return;
        }
        featuredKeys.push(key);
        if (!titleKey) titleKey = key;
      }
    } else if (action === "title" && featuredKeys.includes(key)) {
      titleKey = key;
    }

    if (isBadgeSimulationEnabled()) storeSimulatedSelection(featuredKeys, titleKey);
    else await badges.saveSelection(featuredKeys, titleKey);
    await loadCrewCard();
    await populateBadgeCollection();
  }

  document.querySelector("#crew-card-collection")?.addEventListener("click", openBadgeCollection);
  document.querySelector("[data-crew-badge-close]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeDialog(badgeDialog);
  });
  badgeDialog?.addEventListener("click", (event) => {
    if (event.target === badgeDialog) closeDialog(badgeDialog);
  });
  badgeSimulation?.addEventListener("change", async () => {
    setBadgeSimulation(badgeSimulation.checked);
    await loadCrewCard();
    await populateBadgeCollection();
  });
  document.querySelector("#crew-badge-collection")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-action][data-badge-key]");
    if (!button || button.disabled) return;
    try {
      await updateBadgeSelection(button.dataset.badgeKey, button.dataset.badgeAction);
      sessionUi.showToast(button.dataset.badgeAction === "title" ? "Titelbadge bijgewerkt." : "Crew Card bijgewerkt.");
    } catch (error) {
      sessionUi.showToast(error.message || "Badgekeuze opslaan is niet gelukt.");
    }
  });
  document.addEventListener("overuurtje:user-context", (event) => render(event.detail));
  document.addEventListener("overuurtje:badges-updated", () => loadCrewCard());
  window.addEventListener("pageshow", () => {
    if (currentProfile) loadCrewCard();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentProfile) loadCrewCard();
  });
  sessionUi.ready.then(render);
})();
