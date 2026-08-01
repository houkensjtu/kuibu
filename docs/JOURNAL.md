# kuibu 开发日志

按里程碑/按天记的工程日志——回答"某个决定是什么时候做的、当时改了什么、踩了什么坑"。
跟 `docs/history/` 不是一回事：那边是完整对话过程的存档（决策怎么推演出来的），
这里只记工程侧的时间线和结果，供以后快速翻查、不用重读整份对话记录。

新条目加在文件末尾，不要改历史条目——如果发现某条记录错了，加一条新的注明"更正"，
就像 git 只 append 新 commit 一样。

---

## 2026-07-31 —— M0：Schema 与双侧校验

从零搭出 TS 工具链（`tsx`/`commander`/`vitest`）和一个能跑 `--version` 的 `kuibu` 桩命令，
然后手写 `schema/pack.schema.json` / `schema/events.schema.json`（draft-07），两侧各自生成
类型：Python 侧 `datamodel-code-generator` 生成 pydantic v2 模型，TS 侧 `ajv` 编译校验器 +
`json-schema-to-typescript` 生成类型。手写一个 3 block / 2 知识点 / 2 题的样例包，两侧校验
都过。

**踩的坑**（已写进 CLAUDE.md「踩过的坑」）：Windows 下 Python 默认 stdout 编码是 cp1252，
一打印中文就崩，`datamodel-code-generator` 也要显式 `--encoding utf-8`；pydantic v2 配合
`from __future__ import annotations` 时字段名不能和它引用的类型同名（`Checkin.date: date`）；
`ajv`/`ajv-formats` 在 `moduleResolution: nodenext` 下默认导入类型推断不对。

## 2026-07-31 —— M1：core/ 纯逻辑

零 IO 的 `core/` 六件套依次落地，每个都配 vitest 单测 + 一个 `tsx` demo 脚本肉眼验证：
`checkinDate`（偏移自然日换算）→ `scheduler`（Leitner 5 档）→ `reducer`（事件日志折叠成状态）
→ `sessionPacker`（按时长目标打包今日阅读）→ `questionQueue`（新内容/错题/到期项排序 +
选项 shuffle）→ `checkinJudgment`（打卡判定，当时的版本还是"阅读时长达标 AND 题目全部完成"，
8 月改过一次，见下）。

## 2026-07-31 —— M2：CLI 闭环跑通样例包

`cli/loadPack.ts` 加载校验样例包 → `cli/eventLog.ts` 逐行 append 写事件日志 → 阅读流程接
系统 pager + 计时 → 答题流程展示打乱后的选项、判分、答错显示解析 → 打卡判定 + ASCII 热力图
→ 进度呈现（小节 + 整章百分比）→ `--minutes` 让每日目标可调 → `export`/`import` 支持备份和
崩溃恢复。到此为止全程不需要 LLM，闭环先跑通，内容供给放到 M3。

## 2026-07-31 晚 —— M3：生成器，人工代 LLM

`TexinfoHtmlAdapter` 把真实 SICP 第一章源文件（从 sarabander.github.io 镜像抓取）机械切分成
各小节。内容生成这一步，因为没有接入真实 API（用户决定先跳过，自己以后再接），由 Claude 本人
按 `pack-gen/generator/section_prompt.md` 的规格手写每小节的 `SectionLLMOutput`（块边界 + 元
数据 + 知识点 + 选择题，绝不复述原文），脚本再按边界索引从原文切出 `content_md`。先在 1.1.1
单节验证这条链路，再扩展成支持增量/幂等重跑的全章流水线（`build_all_sections.py`，按输入
hash 判断是否需要重新切割，id 编号跨小节连续递增，不因为跳过的小节而错位）。

## 2026-07-31 深夜 —— 真实内容上线 + 两个内容 bug + 一个崩溃 bug

补齐 1.1 剩余小节的手写内容，组装出 `packs/public/sicp/`（当时是 1.1 全部 8 节，49 blocks/
27 items/27 questions），加上 `.gitignore` + `.githooks/pre-commit` 防止私有内容包误推。

用户实测后报告了三个问题，全部修复：
1. **CLI 界面和题目都在用中文**，而 SICP 是英文书——把 `cli/` 用户可见字符串翻成英文，题目
   内容按源书语言（英文）重新生成，写进 `feedback_language_rules` 记忆。
2. **打卡日目标从来没问过用户就自己定了默认值**——加 `cli/targetPrompt.ts`，只在真正首次运行
   （没有 `--minutes` 也没有历史记录）才交互式询问。
3. **Chapter 1 的引言部分（Locke 引语、"Programming in Lisp"）整段缺失**——排查发现只有编号
   小节文件被喂给了适配器，`Chapter-1.xhtml` 这类引言文件根本没被抓取解析；顺带发现
   `<blockquote>` 被适配器整段丢弃的独立 bug。两者都修了，加了 `_parse_chapter_intro` 分支，
   引言用 `["1","1.0","1.0.1"]` 这样的合成 section_path 排在编号小节之前。

当晚用户实测第一天阅读后报告**程序在还没做任何操作时就异常退出**——排查发现是
`readline.Interface.question()` 在同一个 Interface 上连续调用两次会在第二次误判 stdin 已经
结束，`tsx` 和纯 node 下都复现，跟之前怀疑的 "tsx + 之前调用过 spawnSync" 完全无关（这是对
M2.16 一次错误诊断的更正）。修复：`cli/lineReader.ts` 完全不用 `readline`，自己缓冲 stdin
按换行切分。

## 2026-08-01 —— 打卡逻辑改版 + status 命令 + 默认包路径

用户提出三个改动：

1. **打卡不应该卡在"读够时长"上**，只要读完当天分配的内容、做完当天的题目就该算数；时长只
   作为完成后的参考反馈——明显偏少/偏多就顺手问一句要不要调整明天的目标，不偏离就只展示耗时。
   `core/checkinJudgment.ts` 的 `isCheckinComplete` 签名从"总阅读秒数 + 目标秒数"改成
   "分配的 block id + 今天实际读过的 block id"，`cli/targetPrompt.ts` 加
   `classifyTimeSpent`/`askAdjustTarget`。`docs/DESIGN.md` §3.2 同步更新。
2. **需要一个不进入完整 session 就能看当前状态的命令**——加 `kuibu status`：当前连续天数、
   今天是否已打卡、阅读进度、待复习题数、热力图，复用 `core/heatmap.ts` 的
   `computeCurrentStreak` 和 `core/progress.ts` 的 `computeProgress`。
3. **只有一本书，不该每次都打 `--pack`**——`today`/`status` 默认指向 `packs/public/sicp`。

顺带确认了当时还没有全局链接 `kuibu` 命令，日常用 `npm run dev -- today`；`npm run build &&
npm link` 作为可选路径写进后面补的 README。

## 2026-08-01 —— 补完 Chapter 1 全部内容（M4.24）+ README（M4.25）

剩余 10 个小节（1.2.1-1.2.6、1.3.1-1.3.4）的手工内容，改成**并行**授权：给每个小节一个独立
的 subagent，各自读取机械切分产物 + 生成规格 + 一份已完成小节作参考风格，产出并自我校验
`SectionLLMOutput` JSON——这仍然是"人工代 LLM"，没有接入真实 API，只是把原来串行做的手工
authoring 摊开成并行（10 个小节互相独立，天然适合分发）。汇总重跑 `build_all_sections.py`
后，`packs/public/sicp/` 变成完整的 137 blocks / 76 items / 80 questions（覆盖 1.1/1.2/1.3
全部小节 + 章节引言）。重新合并时顺带修好了一处遗留的编码 bug：`merged-pack-parts.json` 比
已经修好的 `pack-parts/*.json` 缓存更旧，留着 Locke 那句的乱码 em dash，重新合并后自动修复。

补了 `README.md`：日常怎么跑（`npm run dev --` 或 `build+link`）、命令一览、怎么在不碰真实
打卡记录的前提下试用、项目结构、内容生成现状。

写这两份文档时确认了一件事：**用户已经用真实的 `.kuibu-events.jsonl` 开始了自己的 21 天
打卡**（2026-07-31 有一条真实 checkin，2026-08-01 会话进行中）——所有验证测试从这时起都必须
显式指定 `--log` 到临时路径，绝不能碰默认的事件日志文件。

## 2026-08-01 —— 打卡后重开：复习 vs 超前阅读

用户指出：打卡完成后如果重新打开 `kuibu`，应该让用户选"复习今天读过的内容"（原样重放，不
产生新事件）还是"超前阅读"（照常打包下一批内容并完成阅读+答题）。`readBlockIds` 本来就是
全书累计、不按天分桶的，所以超前阅读的内容自然会被明天的 `packSession` 跳过——不需要额外的
"明天起始点 offset"逻辑，这是数据模型本身的性质。唯一新增的是 `core/reducer.ts` 的
`blockIdsReadOnDate`（按打卡日过滤 `block_read` 事件，供"复习"这条路径用，因为累计的
`readBlockIds` 分不出"今天具体读了哪些"）和 `cli/reviewOrAheadPrompt.ts` 的选择提示。
`docs/DESIGN.md` 加了 §3.2.1 记录这个决定。
