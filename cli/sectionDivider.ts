const DIVIDER_WIDTH = 44;

/**
 * 阅读/复习题/习题三个环节各自的分割标题——纯视觉锚点，帮用户知道自己
 * 正处在今天流程的哪一段。
 */
export function printSectionDivider(label: string): void {
  const rule = "=".repeat(DIVIDER_WIDTH);
  console.log(`\n${rule}\n  ${label}\n${rule}\n`);
}
