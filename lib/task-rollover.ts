export function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateRangeInclusive(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addUtcDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}
