(function initializeLiveWorkday(global) {
  "use strict";

  const MINUTES_PER_DAY = 24 * 60;
  const QUARTER_MINUTES = 15;
  const FRAMES_PER_SECOND = 25;
  const FRAME_DURATION_MS = 1000 / FRAMES_PER_SECOND;

  function localDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function previousLocalDateValue(date = new Date()) {
    const previousDate = new Date(date);
    previousDate.setDate(previousDate.getDate() - 1);
    return localDateValue(previousDate);
  }

  function parseTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function roundedCurrentTime(date = new Date()) {
    const minutes = date.getHours() * 60 + date.getMinutes();
    const rounded = Math.round(minutes / QUARTER_MINUTES) * QUARTER_MINUTES;
    const normalized = rounded % MINUTES_PER_DAY;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  }

  function formatDuration(minutes) {
    const safeMinutes = Math.max(0, Math.floor(minutes));
    const hours = Math.floor(safeMinutes / 60);
    const remainder = safeMinutes % 60;
    const hourText = `${hours} ${hours === 1 ? "uur" : "uur"}`;
    return remainder ? `${hourText} ${remainder} minuten` : hourText;
  }

  function formatTimecode(date = new Date()) {
    const frames = Math.min(
      FRAMES_PER_SECOND - 1,
      Math.floor(date.getMilliseconds() / FRAME_DURATION_MS)
    );
    return [
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      frames
    ].map((part) => String(part).padStart(2, "0")).join(":");
  }

  function getState({ armed = false, date, startTime, endTime, breakMinutes = 0, now = new Date() }) {
    const startMinutes = parseTime(startTime);
    const isToday = date === localDateValue(now);
    const isYesterday = date === previousLocalDateValue(now);
    if (
      !armed
      || !date
      || (!isToday && !isYesterday)
      || startMinutes === null
      || endTime
    ) {
      return { active: false, elapsedMinutes: 0, workedMinutes: 0 };
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const elapsedSinceStart = currentMinutes - startMinutes + (isYesterday ? MINUTES_PER_DAY : 0);
    if (elapsedSinceStart < 0) {
      return { active: false, elapsedMinutes: 0, workedMinutes: 0 };
    }

    const elapsedMinutes = Math.floor(elapsedSinceStart / QUARTER_MINUTES) * QUARTER_MINUTES;
    const workedMinutes = Math.max(0, elapsedMinutes - Math.max(0, Number(breakMinutes) || 0));
    return {
      active: true,
      elapsedMinutes,
      workedMinutes,
      label: `${formatDuration(workedMinutes)} gewerkt`,
      timecode: formatTimecode(now)
    };
  }

  function createController({ read, render, onTick = () => {} }) {
    let timer = null;
    let lastTickSecond = null;

    function renderCurrent() {
      const now = new Date();
      const state = getState({ ...read(), now });
      render(state);
      const tickSecond = Math.floor(now.getTime() / 1000);
      if (tickSecond !== lastTickSecond) {
        lastTickSecond = tickSecond;
        onTick(state, now);
      }
      return state;
    }

    function schedule() {
      clearTimeout(timer);
      const state = renderCurrent();
      const now = new Date();
      const elapsedInQuarter = (
        (now.getMinutes() % QUARTER_MINUTES) * 60 + now.getSeconds()
      ) * 1000 + now.getMilliseconds();
      const delay = state.active
        ? Math.max(10, FRAME_DURATION_MS - (now.getMilliseconds() % FRAME_DURATION_MS))
        : Math.max(1000, QUARTER_MINUTES * 60 * 1000 - elapsedInQuarter + 100);
      timer = setTimeout(schedule, delay);
      return state;
    }

    function update() {
      return schedule();
    }

    function stop() {
      clearTimeout(timer);
      timer = null;
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") schedule();
    });

    schedule();
    return Object.freeze({ update, stop });
  }

  global.OveruurtjeLiveWorkday = Object.freeze({
    QUARTER_MINUTES,
    FRAMES_PER_SECOND,
    localDateValue,
    previousLocalDateValue,
    parseTime,
    roundedCurrentTime,
    formatDuration,
    formatTimecode,
    getState,
    createController
  });
})(globalThis);
