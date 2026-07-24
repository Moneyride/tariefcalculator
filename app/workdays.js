(function initializeWorkdaysPage() {
  "use strict";

  const sessionUi = globalThis.OveruurtjeSessionUI;
  const workdayService = globalThis.OveruurtjeWorkdays;
  const calculateTariff = globalThis.TariffCalculator.calculateTariff;
  const loggedOut = document.querySelector("#workdays-logged-out");
  const upgrade = document.querySelector("#workdays-upgrade");
  const content = document.querySelector("#workdays-content");
  const empty = document.querySelector("#workdays-empty");
  const groups = document.querySelector("#workdays-groups");
  const deleteDialog = document.querySelector("#delete-workday-dialog");
  const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const dateFormat = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const monthFormat = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
  let currentContext = null;
  let pendingDeleteId = null;

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
          <button class="workday-delete-button" type="button" aria-label="Werkdag verwijderen" title="Werkdag verwijderen">&times;</button>
        `;
        article.querySelector(".workday-date").textContent = dateFormat.format(parseDate(workday.workDate));
        article.querySelector(".workday-times").textContent = snapshot.endTime
          ? `${snapshot.startTime || "-"} – ${snapshot.endTime}`
          : `${snapshot.startTime || "-"} – eindtijd open`;
        article.querySelector(".workday-total").textContent = result ? euro.format(result.subtotalExVat) : "Nog geen totaal";
        const status = article.querySelector(".workday-status");
        status.textContent = snapshot.endTime ? "Afgerond" : "Concept";
        status.classList.toggle("is-complete", Boolean(snapshot.endTime));
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

  async function load(context) {
    currentContext = context;
    const user = context.auth.user;
    loggedOut.hidden = Boolean(user);
    upgrade.hidden = !user || context.isPro;
    content.hidden = !user || !context.isPro;
    if (!user || !context.isPro) return;
    try {
      const items = await workdayService.list(user.id, { mock: context.subscription.isMock });
      render(items);
    } catch (error) {
      sessionUi.showToast(error.message || "Werkdagen konden niet worden geladen.");
    }
  }

  document.querySelector("#workdays-login").addEventListener("click", () => sessionUi.openAuth("login"));
  document.querySelector("#cancel-workday-delete").addEventListener("click", () => closeDialog(deleteDialog));
  document.querySelector("#keep-workday").addEventListener("click", () => closeDialog(deleteDialog));
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
