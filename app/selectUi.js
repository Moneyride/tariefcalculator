(function initializeSelectUi(global) {
  "use strict";

  const enhanced = new WeakMap();
  let openControl = null;

  function close(control = openControl) {
    if (!control) return;
    control.classList.remove("is-open");
    control.querySelector(".styled-select-trigger")?.setAttribute("aria-expanded", "false");
    control.querySelector(".styled-select-menu")?.setAttribute("hidden", "");
    if (openControl === control) openControl = null;
  }

  function selectedLabel(select) {
    return select.selectedOptions[0]?.textContent?.trim() || "Maak een keuze";
  }

  function refresh(select) {
    const control = enhanced.get(select);
    if (!control) return;
    const trigger = control.querySelector(".styled-select-trigger");
    const menu = control.querySelector(".styled-select-menu");
    trigger.querySelector("span").textContent = selectedLabel(select);
    trigger.disabled = select.disabled;
    control.classList.toggle("is-disabled", select.disabled);

    menu.replaceChildren(...Array.from(select.options).map((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "styled-select-option";
      item.dataset.value = option.value;
      item.disabled = option.disabled;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.textContent = option.textContent;
      item.addEventListener("click", () => {
        if (option.disabled) return;
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refresh(select);
        close(control);
        trigger.focus();
      });
      return item;
    }));
  }

  function enhance(select) {
    if (!select || select.dataset.nativeSelect !== undefined) return;
    if (enhanced.has(select)) {
      refresh(select);
      return;
    }

    const control = document.createElement("div");
    control.className = "styled-select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "styled-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span></span><i aria-hidden="true"></i>';
    const menu = document.createElement("div");
    menu.className = "styled-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    select.parentNode.insertBefore(control, select);
    control.append(select, trigger, menu);
    select.classList.add("styled-select-native");
    enhanced.set(select, control);

    trigger.addEventListener("click", () => {
      const willOpen = !control.classList.contains("is-open");
      close();
      if (!willOpen || select.disabled) return;
      refresh(select);
      control.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      openControl = control;
    });
    select.addEventListener("change", () => refresh(select));

    new MutationObserver(() => refresh(select)).observe(select, {
      attributes: true,
      attributeFilter: ["disabled"],
      childList: true,
      subtree: true
    });
    refresh(select);
  }

  function enhanceAll(root = document) {
    root.querySelectorAll("select").forEach(enhance);
  }

  document.addEventListener("click", (event) => {
    if (openControl && !openControl.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  enhanceAll();
  global.OveruurtjeSelectUI = Object.freeze({ enhance, enhanceAll, refresh, close });
})(globalThis);
