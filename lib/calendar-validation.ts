export function isCalendarDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)
  )
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function isCalendarPeriod(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

export function wholeYen(value: unknown, allowZero = true) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1)
  )
    throw new Error(
      `Enter a safe whole-yen amount ${allowZero ? 'of zero or more' : 'greater than zero'}.`,
    );
  return value;
}
