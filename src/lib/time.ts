export const APP_TIME_ZONE = "America/Los_Angeles";

function getDateTimeParts(date: Date, timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function getTimeZoneOffsetMs(utcMs: number, timeZone = APP_TIME_ZONE) {
  const parts = getDateTimeParts(new Date(utcMs), timeZone);
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return zonedAsUtc - utcMs;
}

export function formatScheduleDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
}

export function formatScheduleDateTimeLong(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
}

export function formatScheduleTimeHHMM(date: Date | string) {
  const parts = getDateTimeParts(new Date(date));
  return `${parts.hour}:${parts.minute}`;
}

export function toScheduleDatetimeLocalValue(date: Date | string) {
  const parts = getDateTimeParts(new Date(date));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function scheduleDatetimeLocalToIso(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return new Date(value).toISOString();

  const [, year, month, day, hour, minute, second = "00"] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  let utcMs = localAsUtc - getTimeZoneOffsetMs(localAsUtc);
  utcMs = localAsUtc - getTimeZoneOffsetMs(utcMs);

  return new Date(utcMs).toISOString();
}

export function nextWednesdayAt7pmScheduleLocal(now: Date = new Date()) {
  const parts = getDateTimeParts(now);
  const candidate = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };

  const targetDow = 3;
  const currentDow = new Date(
    Date.UTC(candidate.year, candidate.month - 1, candidate.day)
  ).getUTCDay();
  let daysUntil = (targetDow - currentDow + 7) % 7;

  const candidateDate = new Date(
    Date.UTC(candidate.year, candidate.month - 1, candidate.day + daysUntil)
  );
  let candidateValue = [
    candidateDate.getUTCFullYear(),
    String(candidateDate.getUTCMonth() + 1).padStart(2, "0"),
    String(candidateDate.getUTCDate()).padStart(2, "0"),
  ].join("-") + "T19:00";

  if (
    daysUntil === 0 &&
    now.getTime() > new Date(scheduleDatetimeLocalToIso(candidateValue)).getTime()
  ) {
    daysUntil = 7;
    const nextWeekDate = new Date(
      Date.UTC(candidate.year, candidate.month - 1, candidate.day + daysUntil)
    );
    candidateValue = [
      nextWeekDate.getUTCFullYear(),
      String(nextWeekDate.getUTCMonth() + 1).padStart(2, "0"),
      String(nextWeekDate.getUTCDate()).padStart(2, "0"),
    ].join("-") + "T19:00";
  }

  return candidateValue;
}
