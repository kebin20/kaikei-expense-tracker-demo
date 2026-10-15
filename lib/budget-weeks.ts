// Calendar budget buckets, not ISO/Monday-based weeks. Persisted category names
// remain identities; these helpers only describe dates and choose UI defaults.
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function budgetWeekNumber(day: number): number {
  if (!Number.isInteger(day) || day < 1 || day > 31)
    throw new RangeError('A calendar day from 1 to 31 is required.');
  return day <= 7 ? 1 : day <= 15 ? 2 : day <= 23 ? 3 : 4;
}

function ordinal(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  return `${day}${suffix}`;
}

export function budgetWeekRange(period: string, week: number) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match || !Number.isInteger(week) || week < 1 || week > 4)
    throw new RangeError(
      'A YYYY-MM period and budget week from 1 to 4 are required.',
    );
  const year = Number(match[1]);
  const month = Number(match[2]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lastDay =
    month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  const startDay = [1, 8, 16, 24][week - 1];
  const endDay = [7, 15, 23, lastDay][week - 1];
  return {
    startDay,
    endDay,
    label: `${MONTH_NAMES[month - 1]} ${ordinal(startDay)} – ${ordinal(endDay)}`,
  };
}
