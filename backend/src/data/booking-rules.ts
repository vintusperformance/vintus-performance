// ============================================================
// booking-rules — class-schedule blackout for Anthony's calls
// ============================================================
// Anthony has classes Tue/Thu through the fall semester. No paid
// session or free consultation should be bookable before 2pm on
// those days until the semester ends. Update SEMESTER_END_DATE
// each term rather than deleting this file.

const SEMESTER_END_DATE = "2026-12-20";
const BLOCKED_DAYS_OF_WEEK = [2, 4]; // Tuesday, Thursday (0=Sun..6=Sat)
const BLOCKED_BEFORE_HOUR = 14; // 2pm, 24h clock

// Every bookable hour (see CONFIG.availableHours in booking.js /
// paid-session.js) that falls before the cutoff on a blocked day.
const BLOCKED_HOURS = [9, 10, 11, 13];

export function getClassScheduleBlockedTimes(dateStr: string): string[] {
  if (dateStr > SEMESTER_END_DATE) return [];

  const date = new Date(`${dateStr}T00:00:00`);
  if (!BLOCKED_DAYS_OF_WEEK.includes(date.getDay())) return [];

  const times: string[] = [];
  for (const hour of BLOCKED_HOURS) {
    times.push(`${hour}:00`, `${hour}:30`);
  }
  return times;
}

export function isClassScheduleBlocked(dateStr: string, timeStr: string): boolean {
  if (dateStr > SEMESTER_END_DATE) return false;

  const date = new Date(`${dateStr}T00:00:00`);
  if (!BLOCKED_DAYS_OF_WEEK.includes(date.getDay())) return false;

  const hour = parseInt(timeStr.split(":")[0] ?? "", 10);
  return hour < BLOCKED_BEFORE_HOUR;
}
