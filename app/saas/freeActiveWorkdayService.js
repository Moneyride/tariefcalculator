(function initializeFreeActiveWorkdayService() {
  "use strict";

  const STORAGE_KEY = "overuurtjeFreeActiveWorkdaysV1";

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeAll(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function isOvernightSnapshot(snapshot = {}) {
    if (!snapshot.endTime) return true;
    return Boolean(snapshot.startTime) && snapshot.endTime <= snapshot.startTime;
  }

  function canSaveSnapshot(snapshot = {}, now = new Date()) {
    if (!snapshot.date || !snapshot.startTime) return false;
    const today = localDateValue(now);
    if (snapshot.date === today) return true;

    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return snapshot.date === localDateValue(yesterdayDate) && isOvernightSnapshot(snapshot);
  }

  function load(userId, now = new Date()) {
    if (!userId) return null;
    const record = readAll()[userId] || null;
    return record && canSaveSnapshot(record.calculationData, now) ? record : null;
  }

  function save(userId, { sourceId = null, calculationData = {} } = {}) {
    if (!userId) throw new Error("Log eerst in om je werkdag te bewaren.");
    const all = readAll();
    const previous = all[userId] || {};
    const now = new Date().toISOString();
    const record = {
      id: previous.id || `free-active-${userId}`,
      userId,
      sourceId: sourceId || previous.sourceId || null,
      name: String(calculationData.workdayName || "").trim(),
      workDate: calculationData.date,
      calculationData,
      createdAt: previous.createdAt || now,
      updatedAt: now
    };
    all[userId] = record;
    writeAll(all);
    return record;
  }

  function clear(userId) {
    if (!userId) return;
    const all = readAll();
    delete all[userId];
    writeAll(all);
  }

  globalThis.OveruurtjeFreeActiveWorkday = Object.freeze({
    canSaveSnapshot,
    load,
    save,
    clear
  });
})();
