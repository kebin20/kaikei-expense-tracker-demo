/** Prepared future months must not become the launch month early. */
export function calendarPeriod(periods: string[], todayDate: string): string {
  const currentMonth = todayDate.slice(0, 7);
  return periods.filter((period) => period <= currentMonth).sort().at(-1) || currentMonth;
}

export function defaultLedgerPeriod(
  data: {
    budgets: Array<{ period: string }>;
    transactions: Array<{ period: string }>;
    periodSummaries?: Array<{ period: string }>;
  },
  todayDate: string,
): string {
  return calendarPeriod(
    data.periodSummaries?.length
      ? data.periodSummaries.map((item) => item.period)
      : [...data.budgets, ...data.transactions].map((item) => item.period),
    todayDate,
  );
}
