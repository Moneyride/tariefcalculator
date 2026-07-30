(function initializeTimePicker(global) {
  "use strict";

  const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const QUARTER_HOURS = ["00", "15", "30", "45"];
  const liveWorkday = globalThis.OveruurtjeLiveWorkday;

  function parts(value) {
    const [hour = "00", minute = "00"] = String(value).split(":");
    return {
      hour: HOURS.includes(hour) ? hour : "00",
      minute: QUARTER_HOURS.includes(minute) ? minute : "00"
    };
  }

  function setValue(field, hour, minute) {
    field.value = `${hour}:${minute}`;
    field.dataset.timePicked = "true";
    delete field.dataset.liveStopped;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function close(exceptPicker) {
    document.querySelectorAll(".time-picker").forEach((picker) => {
      if (picker !== exceptPicker) picker.hidden = true;
    });
  }

  function render(field, picker) {
    const selected = parts(field.value);
    const hourColumn = picker.querySelector("[data-time-column='hours']");
    const minuteColumn = picker.querySelector("[data-time-column='minutes']");

    hourColumn.replaceChildren(...HOURS.map((hour) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = hour;
      button.className = hour === selected.hour ? "active" : "";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setValue(field, hour, parts(field.value).minute);
        render(field, picker);
      });
      return button;
    }));

    minuteColumn.replaceChildren(...QUARTER_HOURS.map((minute) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = minute;
      button.className = minute === selected.minute ? "active" : "";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setValue(field, parts(field.value).hour, minute);
        picker.hidden = true;
      });
      return button;
    }));
  }

  function setup(field) {
    if (!field || field.dataset.timePickerReady === "true") return;
    const control = field.closest(".time-control");
    const trigger = control?.querySelector(".time-picker-trigger");
    if (!control || !trigger) return;
    field.dataset.timePickerReady = "true";

    const picker = document.createElement("div");
    picker.className = "time-picker";
    picker.hidden = true;
    picker.innerHTML = `
      <div class="time-picker-column" data-time-column="hours" aria-label="Uren"></div>
      <div class="time-picker-column" data-time-column="minutes" aria-label="Minuten"></div>
    `;
    control.append(picker);
    picker.addEventListener("click", (event) => event.stopPropagation());
    picker.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });

    const open = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (field.dataset.sharedLocked === "true" || trigger.disabled) return;
      if (
        field.hasAttribute("data-time-picker-current")
        && field.dataset.timePicked !== "true"
        && field.dataset.timeRestored !== "true"
        && liveWorkday
      ) {
        field.value = liveWorkday.roundedCurrentTime();
        field.dataset.timePicked = "true";
        delete field.dataset.liveStopped;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      render(field, picker);
      close(picker);
      picker.hidden = false;
    };
    field.addEventListener("click", open);
    trigger.addEventListener("click", open);
  }

  function setupAll(root = document) {
    root.querySelectorAll("[data-time-picker]").forEach(setup);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".time-control")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  setupAll();
  global.OveruurtjeTimePicker = Object.freeze({ setup, setupAll, close });
})(globalThis);
