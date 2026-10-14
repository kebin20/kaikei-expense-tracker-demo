export interface FlowMonth {
  period: string;
  label: string;
  income: number;
  expense: number;
}
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export function flowForScope(
  data: FlowMonth[],
  period: string,
  scope: 'year' | 'month',
): FlowMonth[] {
  if (scope === 'month') return data.filter((item) => item.period === period);
  const byPeriod = new Map(data.map((item) => [item.period, item]));
  return MONTHS.map((label, index) => {
    const key = `${period.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`;
    return byPeriod.get(key) || { period: key, label, income: 0, expense: 0 };
  });
}
