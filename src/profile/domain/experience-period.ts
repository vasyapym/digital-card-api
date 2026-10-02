export interface ExperiencePeriod {
  startDate: Date;
  endDate: Date | null;
}

function toMonthIndex(d: Date): number {
  if (Number.isNaN(d.getTime())) {
    throw new Error(`некорректная дата: ${String(d)}`);
  }
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function isCurrentExperience(period: ExperiencePeriod, now: Date): boolean {
  const start = toMonthIndex(period.startDate);
  const current = toMonthIndex(now);
  if (start > current) return false;
  return period.endDate === null || toMonthIndex(period.endDate) >= current;
}

export function durationInMonths(period: ExperiencePeriod, now: Date): number {
  const start = toMonthIndex(period.startDate);
  const current = toMonthIndex(now);
  const end = period.endDate === null ? current : Math.min(toMonthIndex(period.endDate), current);
  return end < start ? 0 : end - start + 1;
}

const DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function parseDate(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Ожидается формат YYYY-MM-DD, получено "${value}"`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
