(function initializeAccountLayout() {
  "use strict";
  const content = document.querySelector("#account-content");
  if (!content) return;

  const descriptions = {
    "account-details": ["Jouw gegevens", "Profiel, beveiliging en meldingen"],
    "calculator-settings": ["Rekeninstellingen", "Functies, tarieven en werkregels"],
    "account-equipment-section": ["Apparatuur", "Eigen apparatuur en vaste vergoedingen"]
  };

  function enhanceSections() {
    content.querySelectorAll(".account-section:not(details)").forEach((section) => {
      if (section.dataset.disclosureReady) return;
      section.dataset.disclosureReady = "true";
      const heading = section.querySelector("h2");
      if (!heading) return;
      const fallback = section.classList.contains("subscription-section")
        ? ["Abonnement", "Je huidige plan en Pro-opties"]
        : section.classList.contains("pro-preview-section")
          ? ["Meer met Pro", "Alle extra mogelijkheden"]
          : [heading.textContent, "Koppeling en voorkeuren"];
      const [title, description] = descriptions[section.id] || fallback;
      const details = document.createElement("details");
      details.className = "account-disclosure";
      const summary = document.createElement("summary");
      const text = document.createElement("span");
      const strong = document.createElement("strong");
      const small = document.createElement("small");
      strong.textContent = title;
      small.textContent = description;
      text.append(strong, small);
      summary.append(text);
      const body = document.createElement("div");
      body.className = "account-disclosure-body";
      body.append(...section.childNodes);
      details.append(summary, body);
      section.append(details);
      if (!section.classList.contains("subscription-section")) {
        heading.closest(".account-section-heading")?.classList.add("account-disclosure-toolbar");
      }
    });
    revealAnchor();
  }

  function revealAnchor() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target || !content.contains(target)) return;
    const own = target.querySelector("details.account-disclosure");
    if (own) own.open = true;
    for (let parent = target; parent && parent !== content; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
  }

  // Open hidden groups before browser validation focuses an invalid field.
  content.addEventListener("invalid", (event) => {
    for (let parent = event.target.parentElement; parent && parent !== content; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
  }, true);
  window.addEventListener("hashchange", revealAnchor);
  enhanceSections();
  new MutationObserver(enhanceSections).observe(content, { childList: true });
})();
