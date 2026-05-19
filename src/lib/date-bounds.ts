/** Calendar month as dayKeys YYYY-MM-DD in local time (matches `todayDayKey` / gastos / libro operador). */
export function getMonthBoundsDayKeys(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const format = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    startDayKey: format(start),
    endDayKey: format(end),
  };
}
