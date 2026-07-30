(function initializeInteractionGuard(global) {
  "use strict";

  const MOVE_THRESHOLD_PX = 10;
  const CLICK_SUPPRESSION_MS = 300;
  const INTERACTIVE_SELECTOR = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "label",
    "[role='button']",
    "[role='option']"
  ].join(",");

  let gesture = null;
  let suppressedControl = null;
  let suppressUntil = 0;

  function interactiveControl(target) {
    return target instanceof Element ? target.closest(INTERACTIVE_SELECTOR) : null;
  }

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      gesture = null;
      return;
    }

    const touch = event.touches[0];
    gesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      control: interactiveControl(event.target),
      moved: false
    };
  }, { capture: true, passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const movedX = touch.clientX - gesture.startX;
    const movedY = touch.clientY - gesture.startY;
    if (Math.hypot(movedX, movedY) >= MOVE_THRESHOLD_PX) gesture.moved = true;
  }, { capture: true, passive: true });

  document.addEventListener("touchend", () => {
    if (gesture?.moved && gesture.control) {
      suppressedControl = gesture.control;
      suppressUntil = performance.now() + CLICK_SUPPRESSION_MS;
    }
    gesture = null;
  }, { capture: true, passive: true });

  document.addEventListener("touchcancel", () => {
    gesture = null;
  }, { capture: true, passive: true });

  document.addEventListener("click", (event) => {
    if (!suppressedControl || performance.now() > suppressUntil) {
      suppressedControl = null;
      return;
    }

    const control = interactiveControl(event.target);
    const belongsToGesture = control === suppressedControl
      || control?.contains(suppressedControl)
      || suppressedControl.contains(control);
    if (!belongsToGesture) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    suppressedControl = null;
  }, true);

  global.OveruurtjeInteractionGuard = Object.freeze({
    clickSuppressionMs: CLICK_SUPPRESSION_MS,
    moveThresholdPx: MOVE_THRESHOLD_PX
  });
})(globalThis);
