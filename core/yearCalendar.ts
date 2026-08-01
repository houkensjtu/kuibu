const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface CalendarCell {
  /** "YYYY-MM-DD"。跨年填充格（见下）也照样是真实日期，只是不属于 year 那一年。 */
  date: string;
  checkedIn: boolean;
  /** false 表示这一格是为了把首尾两周补成完整的一周才加进来的，不属于 year 那一年。 */
  inYear: boolean;
}

export interface CalendarWeek {
  /** 固定 7 项，index 0 = 周日……6 = 周六。 */
  days: CalendarCell[];
}

export interface MonthLabel {
  /** 这个月 1 号落在 weeks[] 的哪一列。 */
  weekIndex: number;
  label: string;
}

export interface YearCalendar {
  year: number;
  weeks: CalendarWeek[];
  monthLabels: MonthLabel[];
}

/**
 * 按 GitHub 贡献图的布局规则，把一整年的打卡记录排成"每周一列、周日到周六
 * 一行一行往下"的网格：第一列从 1 月 1 号所在那一周的周日开始，最后一列补到
 * 12 月 31 号所在那一周的周六——跨到上一年/下一年的格子标 inYear=false，
 * 只用来在渲染时"淡出"，不计入统计。
 *
 * 纯函数、零 IO，用 `year` 这个数字而非读时钟——CLI 和网页版共用同一份网格
 * 计算，各自只需要决定"一格怎么画"（终端用字符，网页版用一个 div）。
 */
export function buildYearCalendar(
  checkinDates: ReadonlySet<string>,
  year: number,
): YearCalendar {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  const start = new Date(jan1);
  start.setDate(start.getDate() - jan1.getDay());

  const end = new Date(dec31);
  end.setDate(end.getDate() + (6 - dec31.getDay()));

  const weeks: CalendarWeek[] = [];
  const monthLabels: MonthLabel[] = [];

  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const days: CalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const day = cursor.getDate();
      const inYear = y === year;

      if (inYear && day === 1) {
        monthLabels.push({ weekIndex: weeks.length, label: MONTH_LABELS[m] });
      }

      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({ date: dateStr, checkedIn: checkinDates.has(dateStr), inYear });

      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ days });
  }

  return { year, weeks, monthLabels };
}
