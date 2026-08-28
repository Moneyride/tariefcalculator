(function initializeWorkdaysPage() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const workdayService = globalThis.OveruurtjeWorkdays;
  const shareService = globalThis.OveruurtjeShares;
  const shareUi = globalThis.OveruurtjeShareUI;
  const calculateTariff = globalThis.TariffCalculator.calculateTariff;
  const loggedOut = document.querySelector("#workdays-logged-out");
  const upgrade = document.querySelector("#workdays-upgrade");
  const content = document.querySelector("#workdays-content");
  const empty = document.querySelector("#workdays-empty");
  const groups = document.querySelector("#workdays-groups");
  const deleteDialog = document.querySelector("#delete-workday-dialog");
  const receivedSection = document.querySelector("#received-workdays");
  const receivedList = document.querySelector("#received-workdays-list");
  const receivedCount = document.querySelector("#received-workdays-count");
  const monthLabel = document.querySelector("#workdays-month-label");
  const monthEmpty = document.querySelector("#workdays-month-empty");
  const sharedInviteDialog = document.querySelector("#shared-invite-dialog");
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const dateFormat = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  let currentContext = null;
  let pendingDeleteId = null;
  let pendingDeleteShareId = null;
  let ownedWorkdays = [];
  let receivedShares = [];
  let accountingHistory = { exports: [], items: [] };
  let loadedContextKey = "";
  let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
  const monthFormat = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });

  function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function deriveResult(snapshot) {
    if (!snapshot?.endTime) return null;
    if (snapshot.result) return snapshot.result;
    const extras = snapshot.extras || {};
    try {
      const result = calculateTariff({
        startTime: snapshot.startTime,
        endTime: snapshot.endTime,
        breakMinutes: Number(snapshot.breakMinutes) || 0,
        rateMode: snapshot.settings?.rateMode || "day",
        hourlyRate: Number(snapshot.settings?.hourlyRate) || 0,
        enableDroneTariff: Boolean(extras.enableDroneTariff),
        enableRonin4dTariff: snapshot.department === "camera" && Boolean(extras.enableRonin4dTariff),
        customEquipment: extras.customEquipment || [],
        enableKilometers: Boolean(extras.enableKilometers),
        kilometers: Number(extras.kilometers) || 0,
        enableParkingCosts: Boolean(extras.enableParkingCosts),
        parkingCosts: Number(extras.parkingCosts) || 0
      }, snapshot.settings || {});
      return {
        totalHours: result.totalHours,
        overtimeHours: result.overtimeHours,
        nightHours: result.nightHours,
        subtotalExVat: result.subtotalExVat
      };
    } catch {
      return null;
    }
  }

  function render(items) {
    ownedWorkdays = items;
    document.querySelector("#workdays-count").textContent = String(items.length);
    document.querySelector("#workdays-draft-count").textContent = String(
      items.filter((item) => !item.calculationData?.endTime).length
    );
    empty.hidden = items.length > 0;
    groups.hidden = true;
    groups.replaceChildren();
    renderTimeline();
  }

  function renderReceived(items) {
    receivedShares = items;
    renderTimeline();
  }

  function createOwnedTimelineItem(workday) {
    const snapshot = workday.calculationData || {};
    const article = document.createElement("article");
    article.className = "timeline-workday-item is-owned";
    article.innerHTML = `
      <a class="timeline-workday-main" href="index.html?workday=${encodeURIComponent(workday.id)}">
        <span class="timeline-workday-copy"><strong></strong></span>
        <span class="workday-status"></span>
        <span aria-hidden="true">→</span>
      </a>
      <div class="timeline-workday-actions">
        <button class="workday-share-button" type="button">Delen</button>
        <button class="workday-delete-button" type="button" aria-label="Werkdag verwijderen" title="Werkdag verwijderen">&times;</button>
      </div>
    `;
    const formattedDate = dateFormat.format(parseDate(workday.workDate));
    article.querySelector("strong").textContent = formattedDate;
    const status = article.querySelector(".workday-status");
    const createdExportIds = new Set(
      accountingHistory.items
        .filter((item) => accountingHistory.exports.some((entry) => entry.id === item.export_id && entry.status === "created"))
        .map((item) => item.source_id)
    );
    const exported = createdExportIds.has(workday.id);
    status.textContent = exported ? "Moneybird ✓" : (snapshot.endTime ? "Afgerond" : "Concept");
    status.classList.toggle("is-moneybird", exported);
    status.classList.toggle("is-complete", Boolean(snapshot.endTime));
    article.querySelector(".workday-share-button").addEventListener("click", () => {
      shareUi.open({ sourceType: "workday", sourceId: workday.id });
    });
    article.querySelector(".workday-delete-button").addEventListener("click", () => {
      pendingDeleteId = workday.id;
      pendingDeleteShareId = null;
      document.querySelector("#delete-workday-eyebrow").textContent = "Werkdag verwijderen";
      document.querySelector("#delete-workday-copy").textContent = "Deze opgeslagen werkdag kan daarna niet worden teruggehaald.";
      openDialog(deleteDialog);
    });
    return article;
  }

  function createSharedTimelineItem(item) {
    const article = document.createElement("article");
    article.className = "timeline-workday-item is-shared";
    article.innerHTML = `
      <button class="timeline-shared-main" type="button">
        <span class="share-avatar"></span>
        <span class="timeline-workday-copy">
          <strong></strong>
          <small></small>
        </span>
        <span class="workday-origin-tag">Gedeeld</span>
        <span aria-hidden="true">→</span>
      </button>
      <div class="workday-overflow">
        <button class="workday-more-button" type="button" aria-label="Meer opties" aria-expanded="false">&hellip;</button>
        <div class="workday-overflow-menu" hidden>
          <button class="shared-workday-delete-button" type="button">Verwijderen</button>
        </div>
      </div>
    `;
    article.querySelector(".share-avatar").textContent = item.ownerName.charAt(0).toUpperCase();
    article.querySelector("strong").textContent = dateFormat.format(parseDate(item.workDate));
    article.querySelector("small").textContent = `Gedeeld door ${item.ownerName}`;
    article.querySelector(".timeline-shared-main").addEventListener("click", () => {
      location.href = `index.html?shared=${encodeURIComponent(item.id)}`;
    });
    const moreButton = article.querySelector(".workday-more-button");
    const menu = article.querySelector(".workday-overflow-menu");
    moreButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = menu.hidden;
      document.querySelectorAll(".workday-overflow-menu").forEach((other) => { other.hidden = true; });
      document.querySelectorAll(".workday-more-button").forEach((other) => other.setAttribute("aria-expanded", "false"));
      menu.hidden = !opening;
      moreButton.setAttribute("aria-expanded", String(opening));
    });
    article.querySelector(".shared-workday-delete-button").addEventListener("click", () => {
      pendingDeleteId = null;
      pendingDeleteShareId = item.id;
      document.querySelector("#delete-workday-eyebrow").textContent = "Gedeelde werkdag verwijderen";
      document.querySelector("#delete-workday-copy").textContent = "Deze gedeelde werkdag verdwijnt uit jouw overzicht.";
      openDialog(deleteDialog);
    });
    return article;
  }

  document.addEventListener("click", () => {
    document.querySelectorAll(".workday-overflow-menu").forEach((menu) => { menu.hidden = true; });
    document.querySelectorAll(".workday-more-button").forEach((button) => button.setAttribute("aria-expanded", "false"));
  });

  function renderTimeline() {
    // Older versions copied a received share into an owned workday. Keep that
    // data in Supabase, but show only the canonical shared day in this list.
    const visibleOwnedWorkdays = ownedWorkdays.filter(
      (item) => !item.calculationData?.importedFromShare
    );
    const allEntries = [
      ...visibleOwnedWorkdays.map((item) => ({ kind: "owned", date: item.workDate, item })),
      ...receivedShares.map((item) => ({ kind: "shared", date: item.workDate, item }))
    ].sort((a, b) => b.date.localeCompare(a.date));
    const monthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}`;
    const entries = allEntries.filter((entry) => entry.date.startsWith(monthKey));
    receivedSection.hidden = allEntries.length === 0;
    receivedCount.textContent = String(entries.length);
    monthLabel.textContent = monthFormat.format(visibleMonth);
    monthEmpty.hidden = entries.length > 0 || allEntries.length === 0;
    receivedList.replaceChildren(...entries.map((entry) => entry.kind === "owned"
      ? createOwnedTimelineItem(entry.item)
      : createSharedTimelineItem(entry.item)));
    empty.hidden = allEntries.length > 0;
  }

  function shiftVisibleMonth(offset) {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1, 12);
    renderTimeline();
  }

  document.querySelector("#workdays-month-previous")?.addEventListener("click", () => shiftVisibleMonth(-1));
  document.querySelector("#workdays-month-next")?.addEventListener("click", () => shiftVisibleMonth(1));

  function renderInvite(invite, context) {
    document.querySelector("#shared-invite-title").textContent = `${invite.ownerName} wil graag tijden met je delen`;
    const project = sharedInviteDialog.querySelector("[data-invite-project]");
    project.textContent = invite.projectName
      ? `Project: ${invite.projectName}`
      : (invite.workdayName ? `Werkdag: ${invite.workdayName}` : "");
    project.hidden = !invite.projectName && !invite.workdayName;
    sharedInviteDialog.querySelector("[data-invite-date]").textContent = dateFormat.format(parseDate(invite.workDate));
    sharedInviteDialog.querySelector("[data-invite-times]").textContent = `${invite.startTime || "-"} – ${invite.endTime || "eindtijd nog niet ingevuld"}`;
    const message = sharedInviteDialog.querySelector("[data-invite-message]");
    message.textContent = invite.optionalMessage;
    message.hidden = !invite.optionalMessage;
    const loggedOutActions = sharedInviteDialog.querySelector("[data-invite-logged-out]");
    const acceptButton = sharedInviteDialog.querySelector("[data-invite-accept]");
    loggedOutActions.hidden = Boolean(context.auth.user);
    acceptButton.hidden = !context.auth.user;
    sharedInviteDialog.querySelector("[data-invite-status]").textContent = invite.available
      ? ""
      : "Deze uitnodiging is niet meer beschikbaar.";
    acceptButton.disabled = !invite.available;
    openDialog(sharedInviteDialog);
  }

  async function loadInvite(context) {
    const token = new URLSearchParams(location.search).get("invite");
    if (!token || context.subscription.isMock) return;
    try {
      const invite = await shareService.previewInvite(token);
      if (!invite) throw new Error("Deze uitnodiging is niet gevonden.");
      renderInvite(invite, context);
    } catch (error) {
      sessionUi.showToast(error.message || "De uitnodiging kon niet worden geopend.");
    }
  }

  async function acceptInvite() {
    const token = new URLSearchParams(location.search).get("invite");
    if (!token || !currentContext?.auth.user) return;
    const status = sharedInviteDialog.querySelector("[data-invite-status]");
    const button = sharedInviteDialog.querySelector("[data-invite-accept]");
    button.disabled = true;
    status.textContent = "Uitnodiging accepteren…";
    try {
      const shareId = await shareService.claimInvite(token);
      // Claiming creates the recipient relation; accepting makes it visible to
      // both participants and eligible as the active shared workday.
      await shareService.accept(shareId);
      try {
        const awards = await globalThis.OveruurtjeBadges?.evaluate?.();
        if (awards?.length) {
          sessionUi?.showToast(`Badge${awards.length === 1 ? "" : "s"} behaald: ${awards.map((badge) => `${badge.icon} ${badge.name}`).join(" · ")}`);
        }
      } catch (error) {
        console.warn("Badgecontrole na accepteren is niet gelukt.", error);
      }
      try {
        await shareService.markShareNotificationsRead(shareId);
      } catch (error) {
        console.warn("De uitnodigingsmelding kon niet als gelezen worden gemarkeerd.", error);
      }
      closeDialog(sharedInviteDialog);
      location.href = `index.html?shared=${encodeURIComponent(shareId)}`;
    } catch (error) {
      status.textContent = error.message || "Accepteren is niet gelukt.";
      button.disabled = false;
    }
  }

  async function load(context, { force = false } = {}) {
    currentContext = context;
    const user = context.auth.user;
    const contextKey = `${user?.id || "guest"}:${context.subscription.plan}:${context.subscription.isMock}:${location.search}`;
    if (!force && loadedContextKey === contextKey) return;
    loadedContextKey = contextKey;
    loggedOut.hidden = Boolean(user);
    upgrade.hidden = !user || context.isPro;
    content.hidden = !user || !context.isPro;
    if (!user) {
      renderReceived([]);
      await loadInvite(context);
      return;
    }
    try {
      const [items, received, history] = await Promise.all([
        context.isPro
          ? workdayService.list(user.id, { mock: context.subscription.isMock })
          : Promise.resolve([]),
        context.subscription.isMock ? Promise.resolve([]) : shareService.listReceived(),
        context.isPro && !context.subscription.isMock
          ? accountingExportStatus()
          : Promise.resolve({ exports: [], items: [] })
      ]);
      accountingHistory = history;
      if (context.isPro) render(items);
      renderReceived(received);
      await loadInvite(context);
    } catch (error) {
      loadedContextKey = "";
      sessionUi.showToast(error.message || "Werkdagen konden niet worden geladen.");
    }
  }

  async function accountingExportStatus() {
    try {
      return await globalThis.OveruurtjeAccounting.exports();
    } catch (error) {
      console.warn("Moneybird-exportstatus kon niet worden geladen.", error);
      return { exports: [], items: [] };
    }
  }

  document.querySelector("#workdays-login").addEventListener("click", () => sessionUi.openAuth("login"));
  sharedInviteDialog.querySelector("[data-invite-login]").addEventListener("click", () => {
    closeDialog(sharedInviteDialog);
    sessionUi.openAuth("login", { purpose: "share" });
  });
  sharedInviteDialog.querySelector("[data-invite-register]").addEventListener("click", () => {
    closeDialog(sharedInviteDialog);
    sessionUi.openAuth("register", { purpose: "share" });
  });
  sharedInviteDialog.querySelector("[data-invite-accept]").addEventListener("click", acceptInvite);
  sharedInviteDialog.querySelector("[data-shared-invite-close]").addEventListener("click", () => closeDialog(sharedInviteDialog));
  document.querySelector("#cancel-workday-delete").addEventListener("click", () => closeDialog(deleteDialog));
  document.querySelector("#keep-workday").addEventListener("click", () => closeDialog(deleteDialog));
  document.addEventListener("overuurtje:shares-changed", () => {
    if (currentContext) load(currentContext, { force: true });
  });
  document.querySelector("#confirm-workday-delete").addEventListener("click", async () => {
    if ((!pendingDeleteId && !pendingDeleteShareId) || !currentContext?.auth.user) return;
    try {
      if (pendingDeleteShareId) {
        await shareService.remove(pendingDeleteShareId);
      } else {
        await workdayService.remove(currentContext.auth.user.id, pendingDeleteId, {
          mock: currentContext.subscription.isMock
        });
      }
      const removedShare = Boolean(pendingDeleteShareId);
      pendingDeleteId = null;
      pendingDeleteShareId = null;
      closeDialog(deleteDialog);
      await load(currentContext, { force: true });
      sessionUi.showToast(removedShare ? "Gedeelde werkdag verwijderd." : "Werkdag verwijderd.");
    } catch (error) {
      sessionUi.showToast(error.message || "Verwijderen is niet gelukt.");
    }
  });
  document.addEventListener("overuurtje:user-context", (event) => load(event.detail));
  sessionUi.ready.then(load);
})();
