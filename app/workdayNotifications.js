(function initializeWorkdayNotifications(global) {
  "use strict";

  const REMINDER_MINUTES = 15;
  const FIRED_KEY = "overuurtjeWorkdayReminders";

  function readFired() {
    try {
      return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function writeFired(values) {
    localStorage.setItem(FIRED_KEY, JSON.stringify(Array.from(values).slice(-100)));
  }

  function dateAtTime(dateValue, timeValue) {
    const [year, month, day] = String(dateValue).split("-").map(Number);
    const [hour, minute] = String(timeValue || "00:00").split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }

  function buildReminders({ date, startTime, breakMinutes = 0, normalDayHours = 10, enableNightTariff, nightStart }) {
    if (!date || !startTime) return [];
    const start = dateAtTime(date, startTime);
    const overtimeAt = new Date(start.getTime() + (Number(normalDayHours) * 60 + Number(breakMinutes || 0)) * 60000);
    const reminders = [{
      id: `${date}:${startTime}:overtime`,
      type: "overtime",
      at: new Date(overtimeAt.getTime() - REMINDER_MINUTES * 60000),
      title: "Overuren beginnen over 15 minuten",
      body: `Vanaf ${overtimeAt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} begint je overurentijd.`
    }];

    if (enableNightTariff && nightStart) {
      const nightAt = dateAtTime(date, nightStart);
      if (nightAt <= start) nightAt.setDate(nightAt.getDate() + 1);
      reminders.push({
        id: `${date}:${startTime}:night:${nightStart}`,
        type: "night",
        at: new Date(nightAt.getTime() - REMINDER_MINUTES * 60000),
        title: "Nachttoeslag begint over 15 minuten",
        body: `Vanaf ${nightStart} valt je werktijd binnen de ingestelde nachtperiode.`
      });
    }
    return reminders;
  }

  async function showSystemNotification(reminder) {
    if (!("Notification" in global) || Notification.permission !== "granted") return false;
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration?.showNotification) {
        await registration.showNotification(reminder.title, {
          body: reminder.body,
          icon: "icon-192.png",
          badge: "favicon-32x32.png",
          tag: reminder.id
        });
      } else {
        new Notification(reminder.title, { body: reminder.body, icon: "icon-192.png", tag: reminder.id });
      }
      return true;
    } catch {
      return false;
    }
  }

  function createController({ read, onReminder }) {
    const fired = readFired();

    async function check(now = new Date()) {
      const state = read();
      if (!state.active) return;
      const reminders = buildReminders(state);
      for (const reminder of reminders) {
        const difference = now.getTime() - reminder.at.getTime();
        if (difference < 0 || difference >= REMINDER_MINUTES * 60000 || fired.has(reminder.id)) continue;
        fired.add(reminder.id);
        writeFired(fired);
        const shown = await showSystemNotification(reminder);
        onReminder?.(reminder, { systemNotificationShown: shown });
      }
    }

    async function requestPermission() {
      if (!("Notification" in global)) return "unsupported";
      if (Notification.permission !== "default") return Notification.permission;
      return Notification.requestPermission();
    }

    return Object.freeze({
      check,
      requestPermission,
      permission: () => ("Notification" in global ? Notification.permission : "unsupported")
    });
  }

  global.OveruurtjeWorkdayNotifications = Object.freeze({
    REMINDER_MINUTES,
    buildReminders,
    createController
  });
})(globalThis);
