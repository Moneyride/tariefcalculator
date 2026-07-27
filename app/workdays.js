(function initializeWorkdaysPage() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const workdayService = globalThis.OveruurtjeWorkdays;
  const projectService = globalThis.OveruurtjeProjects;
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
  const sharedDetailDialog = document.querySelector("#shared-workday-detail-dialog");
  const sharedExistingDialog = document.querySelector("#shared-existing-workday-dialog");
  const sharedInviteDialog = document.querySelector("#shared-invite-dialog");
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const dateFormat = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const monthFormat = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
  let currentContext = null;
  let pendingDeleteId = null;
  let receivedShares = [];
  let activeReceivedShare = null;
  let existingTakeoverEntry = null;
  let activeInvite = null;

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
    document.querySelector("#workdays-count").textContent = String(items.length);
    document.querySelector("#workdays-draft-count").textContent = String(
      items.filter((item) => !item.calculationData?.endTime).length
    );
    empty.hidden = items.length > 0;
    groups.hidden = items.length === 0;

    const grouped = new Map();
    items.forEach((item) => {
      const key = item.workDate.slice(0, 7);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });

    groups.replaceChildren(...Array.from(grouped.entries()).map(([month, workdays]) => {
      const section = document.createElement("section");
      section.className = "workday-month";
      const heading = document.createElement("h2");
      heading.textContent = monthFormat.format(parseDate(`${month}-01`));
      const list = document.createElement("div");
      list.className = "workday-list";
      list.replaceChildren(...workdays.map((workday) => {
        const snapshot = workday.calculationData || {};
        const result = deriveResult(snapshot);
        const article = document.createElement("article");
        article.className = "workday-list-item";
        article.innerHTML = `
          <a class="workday-main-link" href="index.html?workday=${encodeURIComponent(workday.id)}">
            <span class="workday-date"></span>
            <span class="workday-times"></span>
            <span class="workday-total"></span>
            <span class="workday-status"></span>
            <span class="workday-arrow" aria-hidden="true">→</span>
          </a>
          <button class="workday-share-button" type="button">Deel met collega's</button>
          <button class="workday-delete-button" type="button" aria-label="Werkdag verwijderen" title="Werkdag verwijderen">&times;</button>
        `;
        article.querySelector(".workday-date").textContent = workday.name
          ? `${workday.name} · ${dateFormat.format(parseDate(workday.workDate))}`
          : dateFormat.format(parseDate(workday.workDate));
        article.querySelector(".workday-times").textContent = snapshot.endTime
          ? `${snapshot.startTime || "-"} – ${snapshot.endTime}`
          : `${snapshot.startTime || "-"} – eindtijd open`;
        article.querySelector(".workday-total").textContent = result ? euro.format(result.subtotalExVat) : "Nog geen totaal";
        const status = article.querySelector(".workday-status");
        status.textContent = snapshot.endTime ? "Afgerond" : "Concept";
        status.classList.toggle("is-complete", Boolean(snapshot.endTime));
        article.querySelector(".workday-share-button").addEventListener("click", () => {
          shareUi.open({ sourceType: "workday", sourceId: workday.id });
        });
        article.querySelector(".workday-delete-button").addEventListener("click", () => {
          pendingDeleteId = workday.id;
          openDialog(deleteDialog);
        });
        return article;
      }));
      section.append(heading, list);
      return section;
    }));
  }

  function renderReceived(items) {
    receivedShares = items;
    receivedSection.hidden = items.length === 0;
    receivedCount.textContent = String(items.length);
    receivedList.replaceChildren(...items.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "received-workday-item";
      button.innerHTML = `
        <span class="share-avatar"></span>
        <span class="received-workday-copy">
          <strong></strong>
          <span class="received-workday-project"></span>
          <small></small>
        </span>
        <span class="received-workday-status"></span>
        <span aria-hidden="true">→</span>
      `;
      button.querySelector(".share-avatar").textContent = item.ownerName.charAt(0).toUpperCase();
      button.querySelector("strong").textContent = `${item.ownerName} · ${dateFormat.format(parseDate(item.workDate))}`;
      const project = button.querySelector(".received-workday-project");
      project.textContent = item.projectName || item.workdayName;
      project.hidden = !item.projectName && !item.workdayName;
      button.querySelector("small").textContent = `${item.startTime || "-"} – ${item.endTime || "eindtijd open"}`;
      const status = button.querySelector(".received-workday-status");
      status.textContent = item.acceptedAt ? "Overgenomen" : "Nieuw";
      status.classList.toggle("is-complete", Boolean(item.acceptedAt));
      button.addEventListener("click", () => openReceived(item));
      return button;
    }));
  }

  function openReceived(item) {
    activeReceivedShare = item;
    document.querySelector("#shared-workday-title").textContent = `${item.ownerName} heeft een werkdag gedeeld`;
    const project = sharedDetailDialog.querySelector("[data-shared-project]");
    project.textContent = item.projectName
      ? `Project: ${item.projectName}`
      : (item.workdayName ? `Werkdag: ${item.workdayName}` : "");
    project.hidden = !item.projectName && !item.workdayName;
    sharedDetailDialog.querySelector("[data-shared-date]").textContent = dateFormat.format(parseDate(item.workDate));
    sharedDetailDialog.querySelector("[data-shared-times]").textContent = `${item.startTime || "-"} – ${item.endTime || "eindtijd nog niet ingevuld"}`;
    const message = sharedDetailDialog.querySelector("[data-shared-message]");
    message.textContent = item.optionalMessage;
    message.hidden = !item.optionalMessage;
    renderParticipants(sharedDetailDialog, item.sourceType, item.sourceId);
    openDialog(sharedDetailDialog);
  }

  async function renderParticipants(dialog, sourceType, sourceId) {
    const section = dialog.querySelector("[data-share-participants]");
    const list = dialog.querySelector("[data-share-participants-list]");
    if (!section || !list) return;
    try {
      const participants = await shareService.listParticipants(sourceType, sourceId);
      section.hidden = participants.length === 0;
      list.replaceChildren(...participants.map((participant) => {
        const chip = document.createElement("span");
        chip.className = "participant-chip";
        chip.innerHTML = `<span class="share-avatar"></span><strong></strong>`;
        chip.querySelector(".share-avatar").textContent = participant.firstName.charAt(0).toUpperCase();
        chip.querySelector("strong").textContent = participant.isCurrentUser
          ? `${participant.firstName} (jij)`
          : participant.firstName;
        return chip;
      }));
    } catch {
      section.hidden = true;
    }
  }

  function takeoverSnapshot(item) {
    return {
      schemaVersion: 1,
      workdayName: item.workdayName || "",
      date: item.workDate,
      startTime: item.startTime,
      endTime: item.endTime,
      result: null,
      importedFromShare: item.id
    };
  }

  async function openSharedTimesInCalculator(item) {
    sessionStorage.setItem(
      "overuurtjeSharedTimesImport",
      JSON.stringify(takeoverSnapshot(item))
    );
    await shareService.accept(item.id);
    location.href = "index.html?sharedTimes=1";
  }

  async function findExistingEntry(item) {
    const opts = { mock: currentContext.subscription.isMock };
    const [workdays, projectDays] = await Promise.all([
      workdayService.listByDate(currentContext.auth.user.id, item.workDate, opts),
      projectService.listDaysByDate(currentContext.auth.user.id, item.workDate, opts)
    ]);
    if (projectDays.length) return { kind: "project", ...projectDays[0] };
    if (workdays.length) return { kind: "workday", workday: workdays[0] };
    return null;
  }

  async function createFromShared() {
    const item = activeReceivedShare;
    if (!currentContext.isPro) {
      await openSharedTimesInCalculator(item);
      return;
    }
    const saved = await workdayService.save(currentContext.auth.user.id, {
      name: item.workdayName,
      workDate: item.workDate,
      calculationData: takeoverSnapshot(item)
    }, { mock: currentContext.subscription.isMock });
    await shareService.accept(item.id);
    location.href = `index.html?workday=${encodeURIComponent(saved.id)}`;
  }

  async function updateFromShared(entry) {
    const item = activeReceivedShare;
    if (entry.kind === "project") {
      const full = await projectService.get(currentContext.auth.user.id, entry.project.id, {
        mock: currentContext.subscription.isMock
      });
      full.days = full.days.map((day) => day.id === entry.day.id
        ? {
          ...day,
          calculationData: {
            ...day.calculationData,
            startTime: item.startTime,
            endTime: item.endTime
          }
        }
        : day);
      await projectService.replaceDays(currentContext.auth.user.id, entry.project.id, full.days, {
        mock: currentContext.subscription.isMock
      });
      await shareService.accept(item.id);
      location.href = `projects.html?project=${encodeURIComponent(entry.project.id)}&day=${encodeURIComponent(entry.day.id)}`;
      return;
    }
    const snapshot = {
      ...entry.workday.calculationData,
      date: item.workDate,
      startTime: item.startTime,
      endTime: item.endTime,
      result: null,
      importedFromShare: item.id
    };
    await workdayService.save(currentContext.auth.user.id, {
      id: entry.workday.id,
      name: entry.workday.name || item.workdayName,
      workDate: item.workDate,
      calculationData: snapshot
    }, { mock: currentContext.subscription.isMock });
    await shareService.accept(item.id);
    location.href = `index.html?workday=${encodeURIComponent(entry.workday.id)}`;
  }

  async function beginTakeover() {
    try {
      if (!currentContext?.isPro) {
        await createFromShared();
        return;
      }
      existingTakeoverEntry = await findExistingEntry(activeReceivedShare);
      if (existingTakeoverEntry) {
        closeDialog(sharedDetailDialog);
        openDialog(sharedExistingDialog);
      } else {
        await createFromShared();
      }
    } catch (error) {
      sessionUi.showToast(error.message || "Werktijden overnemen is niet gelukt.");
    }
  }

  function renderInvite(invite, context) {
    activeInvite = invite;
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
      const inviteCanBeImported = activeInvite
        && (activeInvite.shareMode === "direct" || Boolean(activeInvite.endTime));
      if (!currentContext.isPro && inviteCanBeImported) {
        await openSharedTimesInCalculator({ ...activeInvite, id: shareId });
        return;
      }
      const received = await shareService.listReceived();
      renderReceived(received);
      const shared = received.find((item) => item.id === shareId);
      const url = new URL(location.href);
      url.searchParams.delete("invite");
      if (shared) url.searchParams.set("shared", shareId);
      history.replaceState({}, "", url);
      closeDialog(sharedInviteDialog);
      if (shared) openReceived(shared);
      else sessionUi.showToast("Uitnodiging geaccepteerd. Je krijgt een melding zodra de eindtijd bekend is.");
    } catch (error) {
      status.textContent = error.message || "Accepteren is niet gelukt.";
      button.disabled = false;
    }
  }

  async function load(context) {
    currentContext = context;
    const user = context.auth.user;
    loggedOut.hidden = Boolean(user);
    upgrade.hidden = !user || context.isPro;
    content.hidden = !user || !context.isPro;
    if (!user) {
      renderReceived([]);
      await loadInvite(context);
      return;
    }
    try {
      const [items, received] = await Promise.all([
        context.isPro
          ? workdayService.list(user.id, { mock: context.subscription.isMock })
          : Promise.resolve([]),
        context.subscription.isMock ? Promise.resolve([]) : shareService.listReceived()
      ]);
      if (context.isPro) render(items);
      renderReceived(received);
      await loadInvite(context);
      const requestedShare = new URLSearchParams(location.search).get("shared");
      if (requestedShare) {
        const item = received.find((share) => share.id === requestedShare);
        if (item) openReceived(item);
      }
    } catch (error) {
      sessionUi.showToast(error.message || "Werkdagen konden niet worden geladen.");
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
  document.querySelector("#take-over-shared-times").addEventListener("click", beginTakeover);
  document.querySelector("#update-from-shared-times").addEventListener("click", () => {
    if (existingTakeoverEntry) updateFromShared(existingTakeoverEntry);
  });
  document.querySelector("#new-from-shared-times").addEventListener("click", createFromShared);
  document.querySelectorAll("[data-shared-detail-close]").forEach((button) => button.addEventListener("click", () => closeDialog(sharedDetailDialog)));
  document.querySelectorAll("[data-shared-existing-close]").forEach((button) => button.addEventListener("click", () => closeDialog(sharedExistingDialog)));
  document.addEventListener("overuurtje:shares-changed", () => {
    if (currentContext) load(currentContext);
  });
  document.querySelector("#confirm-workday-delete").addEventListener("click", async () => {
    if (!pendingDeleteId || !currentContext?.auth.user) return;
    try {
      await workdayService.remove(currentContext.auth.user.id, pendingDeleteId, {
        mock: currentContext.subscription.isMock
      });
      pendingDeleteId = null;
      closeDialog(deleteDialog);
      await load(currentContext);
      sessionUi.showToast("Werkdag verwijderd.");
    } catch (error) {
      sessionUi.showToast(error.message || "Verwijderen is niet gelukt.");
    }
  });
  document.addEventListener("overuurtje:user-context", (event) => load(event.detail));
  sessionUi.ready.then(load);
})();
