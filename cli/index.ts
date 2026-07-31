#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("kuibu")
  .description("kuibu（跬步）—— 个人读书打卡工具")
  .version("0.1.0");

program.parse();
