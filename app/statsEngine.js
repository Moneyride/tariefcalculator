(function initializeStatsEngine(global) {
  "use strict";

  function parseDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function dateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function startOfWeek(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const mondayOffset = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - mondayOffset);
    return result;
  }

  function summarize(records) {
    return records.reduce((total, record) => {
      total.workdays += 1;
      total.hours += Number(record.totalHours) || 0;
      total.overtime += Number(record.overtimeHours) || 0;
      total.night += Number(record.nightHours) || 0;
      return total;
    }, { workdays: 0, hours: 0, overtime: 0, night: 0 });
  }

  function timeMinutes(value) {
    const [hours, minutes] = String(value || "").split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
  }

  function calculate(records, now = new Date()) {
    const completed = records.filter((record) => record.date && record.endTime);
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12);

    const thisWeek = completed.filter((record) => {
      const date = parseDate(record.date);
      return date >= weekStart && date < weekEnd;
    });
    const thisMonth = completed.filter((record) => {
      const date = parseDate(record.date);
      return date >= monthStart && date < monthEnd;
    });

    const longestDay = completed.reduce((best, record) => (
      !best || Number(record.totalHours) > Number(best.totalHours) ? record : best
    ), null);
    const mostOvertime = completed.reduce((best, record) => (
      !best || Number(record.overtimeHours) > Number(best.overtimeHours) ? record : best
    ), null);
    const earliestStart = completed.reduce((best, record) => {
      const minutes = timeMinutes(record.startTime);
      if (minutes === null) return best;
      return !best || minutes < best.minutes ? { minutes, record } : best;
    }, null);
    const latestEnd = completed.reduce((best, record) => {
      const start = timeMinutes(record.startTime);
      const end = timeMinutes(record.endTime);
      if (start === null || end === null) return best;
      const comparable = end <= start ? end + 24 * 60 : end;
      return !best || comparable > best.minutes ? { minutes: comparable, record } : best;
    }, null);

    const weeks = new Map();
    completed.forEach((record) => {
      const key = dateValue(startOfWeek(parseDate(record.date)));
      weeks.set(key, (weeks.get(key) || 0) + (Number(record.totalHours) || 0));
    });
    const bestWeek = Array.from(weeks, ([week, hours]) => ({ week, hours }))
      .sort((a, b) => b.hours - a.hours)[0] || null;

    return {
      week: summarize(thisWeek),
      month: summarize(thisMonth),
      personal: { longestDay, earliestStart, latestEnd, mostOvertime, bestWeek }
    };
  }

  global.OveruurtjeStats = Object.freeze({ parseDate, startOfWeek, summarize, calculate });
})(globalThis);
