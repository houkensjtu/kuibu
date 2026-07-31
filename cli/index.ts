#!/usr/bin/env node
import { Command } from "commander";
import { loadPack, PackLoadError } from "./loadPack.js";

const program = new Command();

program
  .name("kuibu")
  .description("kuibu（跬步）—— 个人读书打卡工具")
  .version("0.1.0");

program
  .command("today")
  .description("开始/继续今天的阅读打卡")
  .option("--pack <dir>", "内容包目录", "schema/examples/sample-pack")
  .action((options: { pack: string }) => {
    try {
      const pack = loadPack(options.pack);
      console.log(pack.manifest.title);
      console.log(`共 ${pack.blocks.length} 个 block`);
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
