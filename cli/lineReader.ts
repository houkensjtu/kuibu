/**
 * 手写的逐行读取器，完全不用 node:readline。
 *
 * 排查用户反馈的"刚进入答题就莫名其妙退出"时发现：Node 的 readline.Interface
 * 反复调用 question()（哪怕是同一个 Interface 实例上连续调用两次）在某些环境下
 * 会在第二次调用时错误地判定 stdin 已经结束，导致进程在没有任何用户输入的情况下
 * 直接退出——不是我们自己 spawn 子进程（pager）引发的，纯粹两次连续 question()
 * 就能复现。手动缓冲 stdin、自己按换行符切分，完全绕开 readline 的这个问题。
 */
export interface LineReader {
  readLine(): Promise<string>;
  close(): void;
}

export function createLineReader(input: NodeJS.ReadableStream = process.stdin): LineReader {
  let buffer = "";
  const resolvers: Array<(line: string) => void> = [];
  const pendingLines: string[] = [];

  const onData = (chunk: string) => {
    buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      const resolve = resolvers.shift();
      if (resolve) {
        resolve(line);
      } else {
        pendingLines.push(line);
      }
    }
  };

  if ("setEncoding" in input && typeof input.setEncoding === "function") {
    (input as NodeJS.ReadStream).setEncoding("utf8");
  }
  input.on("data", onData);
  if ("resume" in input && typeof input.resume === "function") {
    (input as NodeJS.ReadStream).resume();
  }

  return {
    readLine(): Promise<string> {
      const pending = pendingLines.shift();
      if (pending !== undefined) return Promise.resolve(pending);
      return new Promise((resolve) => resolvers.push(resolve));
    },
    close(): void {
      input.off("data", onData);
      if ("pause" in input && typeof input.pause === "function") {
        (input as NodeJS.ReadStream).pause();
      }
    },
  };
}
