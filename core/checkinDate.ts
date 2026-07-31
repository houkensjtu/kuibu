const DEFAULT_OFFSET_HOURS = 4;

/**
 * 把一个具体时刻换算成"打卡日"：以本地时间凌晨 offsetHours 点为界的偏移自然日。
 * 例如 offsetHours=4 时，本地时间 01:00 算作前一天，04:00 及以后算作当天。
 *
 * 用的是 Date 的本地时间 getter（getFullYear/getMonth/getDate），不是 toISOString()
 * ——toISOString() 固定输出 UTC，会让"本地时间边界"这件事失去意义。
 */
export function checkinDate(ts: Date, offsetHours = DEFAULT_OFFSET_HOURS): string {
  const shifted = new Date(ts.getTime() - offsetHours * 3600_000);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
