(() => {
const DEFAULT_SETTINGS = {
  dayRate: 450,
  normalDayHours: 10,
  vatPercent: 21,
  enableHalfDayUnder6Hours: false,
  enableOvertime10To12: true,
  enableOvertimeFrom12: true,
  enableOvertimeFrom14: false,
  enableNightTariff: true,
  pureNightFactor: 2,
  nightOverlapSurchargeFactor: 1,
  nightStart: "00:00",
  nightEnd: "06:00",
  nightRoundingMinutes: 15
};

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_HOUR = 60;
const OVERTIME_10_TO_12_START = 10;
const OVERTIME_12_PLUS_START = 12;
const OVERTIME_14_PLUS_START = 14;
const OVERTIME_10_TO_12_FACTOR = 1.5;
const OVERTIME_12_PLUS_FACTOR = 2;
const OVERTIME_14_PLUS_FACTOR = 2.5;
const STANDARD_OVERTIME_FACTOR = 1;
const HALF_DAY_FACTOR = 0.75;

function parseTimeToMinutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Gebruik een tijd in het formaat uu:mm.");
  }

  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error("Gebruik een geldige tijd.");
  }

  return hours * MINUTES_PER_HOUR + minutes;
}

function minutesToHours(minutes) {
  return minutes / MINUTES_PER_HOUR;
}

function roundUpToInterval(minutes, intervalMinutes) {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / intervalMinutes) * intervalMinutes;
}

function getWorkInterval(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  let endsNextDay = false;

  if (end <= start) {
    end += MINUTES_PER_DAY;
    endsNextDay = true;
  }

  return {
    start,
    end,
    totalMinutes: end - start,
    endsNextDay
  };
}

function getOverlapMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function getNightWindows(interval, settings) {
  const nightStart = parseTimeToMinutes(settings.nightStart);
  const nightEnd = parseTimeToMinutes(settings.nightEnd);
  const windows = [];
  const startsNextDay = nightEnd <= nightStart;

  for (let day = -1; day <= 1; day += 1) {
    const base = day * MINUTES_PER_DAY;
    const start = base + nightStart;
    const end = base + nightEnd + (startsNextDay ? MINUTES_PER_DAY : 0);

    if (end > interval.start && start < interval.end) {
      windows.push({ start, end });
    }
  }

  return windows;
}

function getTotalOverlapWithWindows(intervalStart, intervalEnd, windows) {
  return windows.reduce(
    (total, window) => total + getOverlapMinutes(intervalStart, intervalEnd, window.start, window.end),
    0
  );
}

function getWorkedHoursInRange(totalHours, startHour, endHour = Infinity) {
  return Math.max(0, Math.min(totalHours, endHour) - startHour);
}

function getOvertimeFactorForRange(startHour, settings) {
  if (startHour >= OVERTIME_14_PLUS_START && settings.enableOvertimeFrom14) {
    return OVERTIME_14_PLUS_FACTOR;
  }

  if (startHour >= OVERTIME_12_PLUS_START && settings.enableOvertimeFrom12) {
    return OVERTIME_12_PLUS_FACTOR;
  }

  if (settings.enableOvertime10To12) {
    return OVERTIME_10_TO_12_FACTOR;
  }

  return STANDARD_OVERTIME_FACTOR;
}

function calculateOvertimeAmount(totalHours, hourlyRate, settings) {
  const overtimeStartHour = settings.normalDayHours;
  const ranges = [
    { start: overtimeStartHour, end: OVERTIME_12_PLUS_START },
    { start: Math.max(overtimeStartHour, OVERTIME_12_PLUS_START), end: OVERTIME_14_PLUS_START },
    { start: Math.max(overtimeStartHour, OVERTIME_14_PLUS_START), end: Infinity }
  ];

  let standardOvertimeHours = 0;
  let overtime10To12Hours = 0;
  let overtimeFrom12Hours = 0;
  let overtimeFrom14Hours = 0;
  let standardOvertimeAmount = 0;
  let overtime10To12Amount = 0;
  let overtimeFrom12Amount = 0;
  let overtimeFrom14Amount = 0;

  ranges.forEach((range) => {
    const hours = getWorkedHoursInRange(totalHours, range.start, range.end);
    if (hours <= 0) return;

    const factor = getOvertimeFactorForRange(range.start, settings);
    const amount = hours * hourlyRate * factor;

    if (factor === OVERTIME_14_PLUS_FACTOR) {
      overtimeFrom14Hours += hours;
      overtimeFrom14Amount += amount;
    } else if (factor === OVERTIME_12_PLUS_FACTOR) {
      overtimeFrom12Hours += hours;
      overtimeFrom12Amount += amount;
    } else if (factor === OVERTIME_10_TO_12_FACTOR) {
      overtime10To12Hours += hours;
      overtime10To12Amount += amount;
    } else {
      standardOvertimeHours += hours;
      standardOvertimeAmount += amount;
    }
  });

  return {
    standardOvertimeHours,
    overtime10To12Hours,
    overtimeFrom12Hours,
    overtimeFrom14Hours,
    standardOvertimeAmount,
    overtime10To12Amount,
    overtimeFrom12Amount,
    overtimeFrom14Amount
  };
}

function calculateTariff(input, customSettings = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...customSettings };
  const interval = getWorkInterval(input.startTime, input.endTime);
  const hourlyRate = settings.dayRate / settings.normalDayHours;
  const totalHours = minutesToHours(interval.totalMinutes);
  const baseAmount = settings.enableHalfDayUnder6Hours && totalHours <= 6
    ? settings.dayRate * HALF_DAY_FACTOR
    : settings.dayRate;

  const normalMinutes = settings.normalDayHours * MINUTES_PER_HOUR;
  const overtimeStart = interval.start + normalMinutes;
  const overtimeMinutes = Math.max(0, interval.end - overtimeStart);
  const overtimeHours = minutesToHours(overtimeMinutes);

  const nightWindows = getNightWindows(interval, settings);
  const rawNightMinutes = getTotalOverlapWithWindows(interval.start, interval.end, nightWindows);
  const roundedNightMinutes = roundUpToInterval(rawNightMinutes, settings.nightRoundingMinutes);

  const rawNightOvertimeMinutes =
    overtimeMinutes > 0 ? getTotalOverlapWithWindows(overtimeStart, interval.end, nightWindows) : 0;
  const roundedNightOvertimeMinutes = Math.min(
    roundedNightMinutes,
    roundUpToInterval(rawNightOvertimeMinutes, settings.nightRoundingMinutes)
  );

  const pureNightMinutes = Math.max(0, roundedNightMinutes - roundedNightOvertimeMinutes);
  const nightHours = minutesToHours(roundedNightMinutes);
  const nightOvertimeHours = minutesToHours(roundedNightOvertimeMinutes);
  const pureNightHours = minutesToHours(pureNightMinutes);

  const overtime = calculateOvertimeAmount(totalHours, hourlyRate, settings);
  const overtimeAmount =
    overtime.standardOvertimeAmount +
    overtime.overtime10To12Amount +
    overtime.overtimeFrom12Amount +
    overtime.overtimeFrom14Amount;
  const nightTariffEnabled = Boolean(settings.enableNightTariff);
  const pureNightAmount = pureNightHours * hourlyRate * settings.pureNightFactor;
  const overlapNightAmount = nightOvertimeHours * hourlyRate * settings.nightOverlapSurchargeFactor;
  const nightAmount = nightTariffEnabled ? pureNightAmount + overlapNightAmount : 0;

  const subtotalExVat = baseAmount + overtimeAmount + nightAmount;
  const vatAmount = subtotalExVat * (settings.vatPercent / 100);
  const totalIncVat = subtotalExVat + vatAmount;

  return {
    settings,
    interval,
    hourlyRate,
    totalHours,
    overtimeHours,
    standardOvertimeHours: overtime.standardOvertimeHours,
    overtime10To12Hours: overtime.overtime10To12Hours,
    overtimeFrom12Hours: overtime.overtimeFrom12Hours,
    overtimeFrom14Hours: overtime.overtimeFrom14Hours,
    firstOvertimeHours: overtime.overtime10To12Hours,
    nextOvertimeHours: overtime.overtimeFrom12Hours + overtime.overtimeFrom14Hours,
    nightHours: nightTariffEnabled ? nightHours : 0,
    nightOvertimeHours: nightTariffEnabled ? nightOvertimeHours : 0,
    pureNightHours: nightTariffEnabled ? pureNightHours : 0,
    baseAmount,
    standardOvertimeAmount: overtime.standardOvertimeAmount,
    overtime10To12Amount: overtime.overtime10To12Amount,
    overtimeFrom12Amount: overtime.overtimeFrom12Amount,
    overtimeFrom14Amount: overtime.overtimeFrom14Amount,
    firstOvertimeAmount: overtime.overtime10To12Amount,
    nextOvertimeAmount: overtime.overtimeFrom12Amount + overtime.overtimeFrom14Amount,
    overtimeAmount,
    pureNightAmount: nightTariffEnabled ? pureNightAmount : 0,
    overlapNightAmount: nightTariffEnabled ? overlapNightAmount : 0,
    nightAmount,
    subtotalExVat,
    vatAmount,
    totalIncVat,
    endsNextDay: interval.endsNextDay
  };
}

globalThis.TariffCalculator = {
  DEFAULT_SETTINGS,
  calculateOvertimeAmount,
  calculateTariff,
  getWorkInterval,
  minutesToHours,
  parseTimeToMinutes,
  roundUpToInterval
};
})();
