#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { loadPack, PackLoadError } from "./loadPack.js";
import { appendEvent } from "./eventLog.js";

// 阶段一先用一个固定默认值；每日时长目标可调（M2.19）会把它换成可配置项。
const DEFAULT_TARGET_SECONDS = 720;

const program = new Command();

program
  .name("kuibu")
  .description("kuibu（跬步）—— 个人读书打卡工具")
  .version("0.1.0");

program
  .command("today")
  .description("开始/继续今天的阅读打卡")
  .option("--pack <dir>", "内容包目录", "schema/examples/sample-pack")
  .option("--log <path>", "事件日志文件路径", ".kuibu-events.jsonl")
  .action((options: { pack: string; log: string }) => {
    try {
      const pack = loadPack(options.pack);
      console.log(pack.manifest.title);
      console.log(`共 ${pack.blocks.length} 个 block`);

      appendEvent(options.log, {
        id: randomUUID(),
        ts: new Date().toISOString(),
        type: "session_start",
        book_id: pack.manifest.book_id,
        target_seconds: DEFAULT_TARGET_SECONDS,
      });
    } catch (err) {
      if (err instanceof PackLoadError) {
        console.error(err.message);
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    }
  });

program.parse();
