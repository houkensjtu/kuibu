import type { HeatmapCell } from "../core/heatmap.js";

/** 把打卡格子渲染成两行 ASCII：一行符号、一行月-日标签。 */
export function renderHeatmap(cells: readonly HeatmapCell[]): string {
  const symbols = cells.map((c) => (c.checkedIn ? "■" : "·")).join(" ");
  const labels = cells.map((c) => c.date.slice(5)).join(" ");
  return `${symbols}\n${labels}`;
}
