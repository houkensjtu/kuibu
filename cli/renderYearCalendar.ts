import type { YearCalendar } from "../core/yearCalendar.js";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GUTTER_WIDTH = 4; // "Sun " 等，3 个字母 + 1 空格
const COLUMN_WIDTH = 2; // 每周一列："■ " / "· " / "  "

/** 月份标签是浮在对应那一周列头上的文字，不是按格对齐的，所以单独画在一块空白画布上叠加。 */
function buildMonthRow(calendar: YearCalendar): string {
  const totalWidth = GUTTER_WIDTH + calendar.weeks.length * COLUMN_WIDTH;
  const chars = new Array(totalWidth).fill(" ");
  for (const { weekIndex, label } of calendar.monthLabels) {
    const offset = GUTTER_WIDTH + weekIndex * COLUMN_WIDTH;
    for (let i = 0; i < label.length && offset + i < totalWidth; i++) {
      chars[offset + i] = label[i];
    }
  }
  return chars.join("").trimEnd();
}

/**
 * 把 buildYearCalendar 算出来的网格画成终端文本：每周一列，周日到周六一行一行
 * 往下画，月份标签浮在对应那一周的列头——跟 GitHub 贡献图是同一种布局，只是
 * 这里用等宽字符而不是 CSS 网格。网格计算（core/yearCalendar.ts）是共用的，
 * 网页版直接换一种"一格怎么画"（一个 div）就行，不用重新设计这套布局。
 */
export function renderYearCalendar(calendar: YearCalendar): string {
  const lines = [buildMonthRow(calendar)];

  for (let dow = 0; dow < 7; dow++) {
    let row = WEEKDAY_LABELS[dow].padEnd(GUTTER_WIDTH);
    for (const week of calendar.weeks) {
      const cell = week.days[dow];
      const symbol = !cell.inYear ? " " : cell.checkedIn ? "■" : "·";
      row += symbol.padEnd(COLUMN_WIDTH);
    }
    lines.push(row.trimEnd());
  }

  return lines.join("\n");
}
