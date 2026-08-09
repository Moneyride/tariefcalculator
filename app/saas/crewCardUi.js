(function initializeCrewCardUi() {
  "use strict";

  let dialog;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "saas-dialog crew-member-dialog";
    dialog.setAttribute("aria-labelledby", "crew-member-dialog-title");
    dialog.innerHTML = `
      <button class="dialog-close" type="button" aria-label="Sluiten">&times;</button>
      <p class="dialog-eyebrow">Crew Card</p>
      <div class="crew-member-dialog-body" aria-live="polite"></div>`;
    dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    return dialog;
  }

  function formatMemberSince(value) {
    if (!value) return "Lid sinds -";
    if (/^\d{4}$/.test(String(value))) return `Lid sinds ${value}`;
    const date = new Date(`${value}T12:00:00`);
    return `Lid sinds ${new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(date)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;"
    }[character]));
  }

  function render(card) {
    const target = ensureDialog().querySelector(".crew-member-dialog-body");
    const name = card?.displayName || "Crewlid";
    const status = card?.selectedBadge?.name || "Crewlid";
    const avatar = card?.avatarUrl
      ? `<img class="crew-member-avatar" src="${escapeHtml(card.avatarUrl)}" alt="">`
      : `<span class="crew-member-avatar">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`;
    const badges = (card?.featuredBadges || card?.recentBadges || []).slice(0, 3)
      .map((badge) => `<span class="crew-member-badge" title="${escapeHtml(badge.name)}">${escapeHtml(badge.icon)}</span>`)
      .join("");
    target.innerHTML = `
      <div class="crew-member-identity">${avatar}<div><h2 id="crew-member-dialog-title">${escapeHtml(name)}</h2><strong>${escapeHtml(status)}</strong><small>${escapeHtml(formatMemberSince(card?.memberSince))}</small></div></div>
      <dl class="crew-member-metrics">
        <div><dt>Geregistreerde werkdagen</dt><dd>${Number(card?.registeredWorkdays || 0)}</dd></div>
        <div><dt>Behaalde badges</dt><dd>${Number(card?.badgeCount || 0)}</dd></div>
        <div><dt>Crewleden</dt><dd>${Number(card?.crewCount || 0)}</dd></div>
      </dl>
      ${card?.jointWorkdays ? `<p class="crew-member-joint">${Number(card.jointWorkdays)} gezamenlijke werkdagen</p>` : ""}
      ${badges ? `<div class="crew-member-badges" aria-label="Uitgelichte badges">${badges}</div>` : ""}`;
  }

  async function open(userId) {
    const badges = globalThis.OveruurtjeBadges;
    if (!badges?.getCrewMember || !userId) return;
    const activeDialog = ensureDialog();
    activeDialog.querySelector(".crew-member-dialog-body").textContent = "Crew Card laden...";
    if (typeof activeDialog.showModal === "function") activeDialog.showModal();
    else activeDialog.setAttribute("open", "");
    try {
      render(await badges.getCrewMember(userId));
    } catch (error) {
      activeDialog.querySelector(".crew-member-dialog-body").textContent = error.message || "Deze Crew Card kon niet worden geladen.";
    }
  }

  function openPreview(card) {
    const activeDialog = ensureDialog();
    render(card || {});
    if (typeof activeDialog.showModal === "function") activeDialog.showModal();
    else activeDialog.setAttribute("open", "");
  }

  globalThis.OveruurtjeCrewCards = Object.freeze({ open, openPreview });
})();
