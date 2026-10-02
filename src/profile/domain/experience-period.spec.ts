import { durationInMonths, isCurrentExperience, parseDate } from './experience-period';

const NOW = new Date('2024-06-15T12:00:00Z');

describe('durationInMonths', () => {
  it('один и тот же месяц = 1 (включительно)', () => {
    expect(durationInMonths({ startDate: parseDate('2021-03-01'), endDate: parseDate('2021-03-31') }, NOW)).toBe(1);
  });

  it('период считается включительно', () => {
    expect(durationInMonths({ startDate: parseDate('2021-03-01'), endDate: parseDate('2022-02-01') }, NOW)).toBe(12);
  });

  it('через границу года: ноябрь 2020 – февраль 2021 = 4', () => {
    expect(durationInMonths({ startDate: parseDate('2020-11-01'), endDate: parseDate('2021-02-28') }, NOW)).toBe(4);
  });

  it('текущая работа считается до now', () => {
    expect(durationInMonths({ startDate: parseDate('2024-01-01'), endDate: null }, NOW)).toBe(6);
  });

  it('endDate в будущем обрезается до now', () => {
    expect(durationInMonths({ startDate: parseDate('2024-01-01'), endDate: parseDate('2025-12-31') }, NOW)).toBe(6);
  });

  it('startDate в будущем => 0', () => {
    expect(durationInMonths({ startDate: parseDate('2024-09-01'), endDate: null }, NOW)).toBe(0);
  });

  it('несколько лет', () => {
    expect(durationInMonths({ startDate: parseDate('2019-06-01'), endDate: parseDate('2022-02-28') }, NOW)).toBe(33);
  });
});

describe('isCurrentExperience', () => {
  it('без endDate и начато в прошлом => текущая', () => {
    expect(isCurrentExperience({ startDate: parseDate('2022-03-01'), endDate: null }, NOW)).toBe(true);
  });

  it('закончилась в прошлом => не текущая', () => {
    expect(isCurrentExperience({ startDate: parseDate('2020-01-01'), endDate: parseDate('2024-05-31') }, NOW)).toBe(false);
  });

  it('заканчивается в текущем месяце => ещё текущая', () => {
    expect(isCurrentExperience({ startDate: parseDate('2020-01-01'), endDate: parseDate('2024-06-30') }, NOW)).toBe(true);
  });

  it('endDate в будущем => текущая', () => {
    expect(isCurrentExperience({ startDate: parseDate('2024-01-01'), endDate: parseDate('2025-01-31') }, NOW)).toBe(true);
  });

  it('startDate в будущем => не текущая', () => {
    expect(isCurrentExperience({ startDate: parseDate('2024-07-01'), endDate: null }, NOW)).toBe(false);
  });

  it('начинается в текущем месяце => текущая', () => {
    expect(isCurrentExperience({ startDate: parseDate('2024-06-01'), endDate: null }, NOW)).toBe(true);
  });
});

describe('parseDate', () => {
  it('парсит в UTC полночь', () => {
    expect(parseDate('2021-03-05').toISOString()).toBe('2021-03-05T00:00:00.000Z');
  });

  it('отклоняет мусор', () => {
    expect(() => parseDate('2021-13-01')).toThrow();
    expect(() => parseDate('2021-3-01')).toThrow();
    expect(() => parseDate('2021-03')).toThrow();
    expect(() => parseDate('')).toThrow();
  });
});
