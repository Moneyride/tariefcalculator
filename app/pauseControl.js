(function initializePauseControls() {
  "use strict";

  document.querySelectorAll('select[name="breakMinutes"]').forEach((select) => {
    const value = document.createElement("input");
    value.type = "hidden";
    value.name = select.name;
    value.value = select.value || "0";
    const control = document.createElement("div");
    control.className = "pause-control";
    const less = document.createElement("button");
    const more = document.createElement("button");
    const display = document.createElement("input");
    for (const button of [less, more]) button.type = "button";
    less.textContent = "−";
    more.textContent = "+";
    less.setAttribute("aria-label", "Pauze 15 minuten korter");
    more.setAttribute("aria-label", "Pauze 15 minuten langer");
    display.type = "text";
    display.inputMode = "text";
    display.setAttribute("aria-label", "Pauze in uren en minuten");
    display.autocomplete = "off";
    display.placeholder = "0:00";
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    function render() {
      const minutes = Math.max(0, Number(value.value) || 0);
      display.value = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
      less.disabled = minutes === 0;
      more.disabled = minutes >= 1440;
    }
    // Loading a saved day sets the form value directly; keep its display in sync.
    Object.defineProperty(value, "value", {
      get() { return descriptor.get.call(this); },
      set(next) { descriptor.set.call(this, next); render(); }
    });
    function commit(minutes) {
      display.setCustomValidity("");
      value.value = String(minutes);
      value.dispatchEvent(new Event("input", { bubbles: true }));
      value.dispatchEvent(new Event("change", { bubbles: true }));
    }
    less.addEventListener("click", () => commit(Math.max(0, Number(value.value) - 15)));
    more.addEventListener("click", () => commit(Math.min(1440, Number(value.value) + 15)));
    display.addEventListener("input", () => display.setCustomValidity(""));
    display.addEventListener("change", () => {
      const match = /^(\d{1,2}):([0-5]\d)$/.exec(display.value.trim());
      const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
      if (!Number.isFinite(minutes) || minutes > 1440 || minutes % 15 !== 0) {
        render();
        display.setCustomValidity("Gebruik kwartieren, bijvoorbeeld 0:15, 1:30 of 2:00.");
        display.reportValidity();
        return;
      }
      commit(minutes);
    });
    display.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); display.blur(); }
    });
    control.append(less, display, more, value);
    select.replaceWith(control);
    render();
  });
})();
