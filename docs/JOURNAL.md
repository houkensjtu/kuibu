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

## 2026-08-01 —— 内容忠实度专项核查

用户单独问了一次"手工切分的内容是否跟原文一致"。三层核查：(1) 重新机械解析源文件、
跟当前缓存的 `sections/*.json` 逐字节 diff，确认缓存没有过期或被手改；(2) 完全绕开缓存，
从头用边界索引重新组装一遍，跟实际发布的 `packs/public/sicp/*.json` 逐字段比对，确认
137/76/80（当时的数字）一模一样，边界覆盖零缺口零重叠；(3) 抽查两处历史上出过问题的段落
（blockquote 里的求值规则、`factorial` 代码块）直接对照原始 XHTML。结论：一致，铁律 6
（LLM 不复述原文）在实际产出上确实被遵守。这次顺带确认了"目前 Exercise 完全没有特殊标记，
混在正文里当普通内容读过去"——这条观察直接引出了后面的 Exercise 功能。

## 2026-08-01 —— 打卡进度改成年历视图

用户反馈"打卡进度显示比较难看，想要日历一样的显示，而且不要重复造轮子，以后网页版要能直接
复用"。把原来的单行 30 天符号+日期两行显示（`core/heatmap.ts` 的 `buildHeatmap` +
`cli/renderHeatmap.ts`）整个换成 GitHub 贡献图风格的全年日历：`core/yearCalendar.ts` 的
`buildYearCalendar` 是纯计算（一年切成"每周一列、周日到周六"的网格，首尾补相邻年份的
padding 格并标 `inYear:false`），`cli/renderYearCalendar.ts` 只负责把这个网格画成等宽字符
——网页版以后只需要换"一格怎么画"（一个 div），不用重新设计"一年怎么切成周"这套逻辑。
`today`/`status` 都改用这一套，年份取"今天"（偏移换算过的打卡日）所在的自然年。
`buildHeatmap` 整个删掉，`computeCurrentStreak` 挪到新起的 `core/streak.ts`（原来的
`heatmap.ts` 名字不再准确）。

## 2026-08-01 —— status 补充：详细当前位置、目录、预计完读天数

用户先反馈"进度显示好像只算了当天读的，不是整本书累计的"——排查后确认计算本身是对的
（cumulative，用虚构的跨天日志验证过），真正容易误导的是紧挨着的另一行"读了多少分钟"
文案本身就带"today"字样，容易被当成进度。接着用户提了两个新增需求：

1. **详细当前位置**：加 `core/progress.ts` 的 `computeCurrentPosition`——找"第一个还没读过
   的 block"所在的小节，故意不是 `lastCompletedSectionPath`（那个会滞后：一个小节读了一半
   不算"完成"，但用户已经身处其中了）。
2. **预计还要几天读完**：`core/completionEstimate.ts` 的 `estimateDaysRemaining`，剩余
   block 的 est_seconds 总和除以每日目标秒数，向上取整（有余数就不能算 0 天）。`status`
   本身不问用户任何问题，没设过目标时就老实说这是"假设"，不是真定过的目标。

随后用户又要求把"详细当前位置"改成"整本书目录 + 箭头指向当前位置"，而不是一行文字。加了
`core/tableOfContents.ts`（按 block 顺序去重出全部小节，一次性列出整本书目录，这也是分给
web 版直接复用的纯数据）和 `cli/renderTableOfContents.ts`（在对应小节前画箭头、标"you are
here today"）。

## 2026-08-01 —— 主动退出（q/Ctrl-C）+ 打卡未完成时重开从头开始

用户要求：阅读/答题过程中按了不该按的键不应该让程序异常退出，只有 `q` 或 Ctrl-C 才是真正
接受的退出方式，退出时要有告别语；如果退出时打卡还没完成，重新打开应该从头开始今天的阅读
（而不是像 M2.20 那次验收标准写的"续上"）。这是对早先"崩溃安全=续上"这个假设的一次显式
修订——用户现在要的是"要么一口气读完一天，要么重来"，不要半途状态。

实现：`cli/readLineOrQuit.ts` 包一层 `readLineOrQuit`（输入 "q" 就 throw 一个 `UserQuit`），
所有交互提示（答题/阅读降级/目标调整/复习-超前选择）统一走这层，不会有哪个提示点漏掉这条
规则。`cli/goodbye.ts` 打告别语，`SIGINT` 单独注册一个 handler 调用同一个函数。"重开从头"
靠 `readBlockIdsForPacking`：打卡还没完成时，今天已经录过的 `block_read`（`blockIdsReadOnDate`
过滤）从 `readBlockIds` 里排除掉再喂给 `packSession`——今天唯一能出现"部分已读、打卡未完成"
的情况就是被中断过，所以这条排除规则不会误伤正常流程。

## 2026-08-01 —— 原书 Exercise 独立建模为第三种、可选做的题目

用户指出内容忠实度核查时顺带发现的问题："Exercise 目前完全没被特殊标记"，要求：每道
Exercise 都要标出来、出一个可选做的"题"；跟每天必做的复习题是两种不同的东西；用户做习题
花的时间计入当天阅读时长反馈，但**不**影响 block 切分的 est_seconds 估算（切分还是按最简单
的文字量逻辑）；用户可以完全自己做，或者看一条 hint（生成器自己写），暂不提供答案。

这是这次会话里唯一一次touch 到两份 schema 的改动：

- `schema/pack.schema.json` 新增 `exercise`（`id`/`block_id`/`number`/`prompt_md`/
  `hint_md`），`ContentPack` 加 `exercises` 必填数组；`schema/events.schema.json` 新增
  `exercise_attempt` 事件（`exercise_id`/`seconds`/`used_hint`）。两侧类型/校验器都重新生成
  （`pack-gen/scripts/gen_models.sh` + `npm run schema:gen-types`），sample-pack 和所有相关
  测试 fixture 跟着补了 `exercises.json`/字段。
- 生成器：`section_llm_output.py` 加 `ExerciseSpec`（只给边界索引 + hint_md，`prompt_md`
  跟 block 的 `content_md` 一样由 `slice_section.py` 按边界机械切出来，不是复述）；
  `slice_section.py` 新增习题的"解锁 block"推导（覆盖习题起始段落的那个 block，不要求手动
  指定，避免跟 block 边界脱节）；`build_all_sections.py` 跟着支持合并 `exercises`。
- `core/exerciseQueue.ts`（今天读过的 block 解锁了哪些习题）、`core/reducer.ts` 新增
  `attemptedExerciseIds` 折叠、`cli/exerciseFlow.ts`+`cli/exercisePrompt.ts`（呈现习题、
  可选看 hint、按 Enter 计时结束，`q` 退出走同一套 `readLineOrQuit`）。`totalReadSecondsToday`
  在习题流程里累加，但 `packSession`/`est_seconds` 完全不知道习题这件事的存在。
- 内容重新处理：用 grep 直接对 20 节的机械切分产物搜 "**Exercise" 标记，发现 12 节共 46 道
  习题（跟 SICP 第一章实际的 1.1–1.46 编号对上了，是个很好的完整性校验）。8 节零习题的只加
  `"exercises": []`；12 节各起一个 subagent 并行处理：定位每道习题的段落边界、写 hint、
  并且**审查现有的 knowledge_items/questions，把明显是照着某道 Exercise 内容出的题挪除**
  （复习题跟 Exercise 不能测同一段内容），涉及 6 个小节的 item/question 编号重排。重建后
  76→70 items、80→73 questions（少的都是被挪去 exercises 的），137 blocks 数量不变。
  重复了一遍完整的"从源文件重新组装、跟发布内容逐字段比对"的核查，零差异。

## 2026-08-01 —— 定下版本号规则

用户要求按通用软件开发规范定版本号规则，只指定一件事：大版本号对应产品阶段（阶段一
CLI 基本可用 = 1.0，阶段二网页版基本可用 = 2.0），升级时机由用户自己判断和宣布，
不是 Claude 看代码改动大小自己决定的；其余（MINOR/PATCH）按通用 SemVer 惯例自己定；
不回溯改历史提交的版本号。写进 `CLAUDE.md`「版本号规则」：MINOR = 新增向后兼容的
用户可见能力，PATCH = 修复/重构/文档/小调整。顺手把 `cli/index.ts` 的 `--version`
改成直接读 `package.json`（原来是两处手动维护同一个数字，跟"保持同步"这条规则本身
矛盾），验证过 `npm run dev` 和编译后的 `dist/` 二进制都能正确解析。

随后又要求把 README 和其他文档相应更新、并 push：README 加了「版本」小节指向这条
规则；`docs/DESIGN.md` §11（阶段路线图）加了版本号跟这张表的对应关系，同时说清楚
"表里的出口条件（21 天打卡）"和"CLI 本身功能基本可用"是两件可能不同时发生的事，
不要混为一谈；顺手发现 `docs/MILESTONES.md` 的 M0-M4 复选框从来没勾过（尽管早就全部
做完了），一并补上，只留"开始连续 21 天打卡"这一项不打勾（这是真的还没完成的，
不是文档滞后）。

## 2026-08-01 —— 章节号移到标题左侧 + 层级化；pager 整个去掉，改一次性输出

用户提了两件事：(1) 章节号目前显示在标题右侧括号里，不容易读，应该放左侧，而且要有
层级结构，一眼看出"哪个大章、哪个部分、哪个小节"；(2) 觉得 pager 逐块暂停没什么必要，
不如把当天的阅读内容一次性输出，对阅读没影响、还减少操作和眼球转动——阅读完按 Enter
进复习题，再按 Enter 进练习环节，三段各要一个醒目的分割标题。

第 (2) 点是对 D7（DESIGN.md §7.4）"单命令一次性流程 + 系统 pager"这条已有架构决策
的正式反悔——原来的理由是"pager 免费提供翻页/搜索/滚动 + 干净的计时锚点"，用户现在
直接反驳了这个理由（终端本身就能滚动翻看，不需要再套一层 pager），所以整个替换掉，
不是我自己决定推翻的。

实现：`cli/pager.ts`/`cli/pager.test.ts` 整个删掉，新增 `cli/renderBlocks.ts`
（`renderSectionHeader` 把 section_path 的第一段标成"Chapter N"、其余原样按 `›`
拼起来放标题左边，`printBlocks` 一次性打印全部 block）和 `cli/sectionDivider.ts`
（`printSectionDivider` 画分割标题）。`cli/readingFlow.ts` 的计时模型跟着改：不再是
逐 block 进出计时，而是"全部展示完"到"用户按 Enter"之间量一个总时长，再按各 block
的 `est_seconds` 占比分摊回每个 block（最后一个 block 兜底吸收四舍五入误差，保证
分摊总和精确等于总耗时）。习题环节的"要不要做"也从 y/N 改成跟阅读→复习一样的
"按 Enter 继续"，"可选"这件事现在体现在每道题本身可以直接按 Enter 秒过，而不是
一个整体开关。

同步更新了 DESIGN.md §3.1/§7.1/§7.4、CLAUDE.md 的「关键行为规格」、README 和
MILESTONES 里所有提到 pager 的地方。

## 2026-08-01 —— 三个开发想法记进项目记忆，定优先级

用户列了三个想法（接入 API、epub 解析+多本书、前情回顾），要求先记下来、权衡
优先级、经批准后一个一个做，不要自己动手。存进了 memory
（`project_kuibu_next_features.md`）：推荐顺序是"前情回顾（机械版）→ epub/多本书
→ API 接入"，理由是前情回顾如果做成"从已有 recap_md 机械拼接"完全不用 API、
现在就能做；顺带flag 了前情回顾字面上的需求（"内容由你或 API 生成，帮用户回忆
累计读过的内容"）跟铁律 2（阅读器绝不联网调 LLM）的真实冲突——因为这是因人
而异、每天都在变的内容，没法像 block 的 recap_md 那样在构建期对每个 reader
都写死同一份。

## 2026-08-01 —— 前情回顾功能落地（idea 3，机械版）

用户拍板：先假设固定每日阅读时长 12 分钟，据此切分整本书、由 Claude 一次性
写好每个切分点的回顾，不再现场调用任何 API；等以后接 API 了再改成动态版
（用户自定阅读时长、现场生成）。Claude 补充了一个关键设计调整：不要按"第几天"
查表（现实节奏跟 12 分钟假设一旦不一致就会对不上），改成按用户**累计读过的
block 数**查表——12 分钟这个假设只用来决定回顾切多细（复用 `packSession`
本身反复套用在整本书上算出切分点：`core/recapCheckpoints.ts` 的
`computeCheckpointBoundaries`），运行时查找（`findApplicableRecapCheckpoint`）
永远按真实累计进度定位，不管用户实际读得快慢、调没调过目标、有没有断签又续上。

新增 schema 类型 `RecapCheckpoint`（`id`/`through_block_count`/`recap_md`），
走了跟 Exercise 一样的两侧 schema 改动流程。给真实 SICP 内容包（137 blocks）
算出 35 个切分点，Claude 本人（没有并行 subagent，因为回顾需要跟前面内容
保持连贯的"渐进压缩"，天然是顺序任务而不是可并行任务）逐条写了 35 段
**累计性**回顾——越靠后的回顾覆盖的内容越多，所以旧内容被压缩得越简略，新
内容相对写得详细一些，跟人回忆一本书时"越早的章节记得越模糊"是同一个道理。
长度控制在 54-109 词，远低于"12 分钟标准日 25%"的预算上限。

回顾这一段插在阅读之前，单独一个 `Recap` 分割标题，花的时间计入当天阅读时长
反馈但不影响 block 切分，跟习题时间同一套规则。第一天（累计 0 个 block）没有
回顾可用，直接跳过。验证：pydantic 校验通过，`through_block_count` 序列
（4,8,...,137）跟 `computeCheckpointBoundaries` 算出来的完全一致；用一份
构造出"已经读过 20 个 block"的假日志实测，正确展示了对应第 5 个切分点的回顾，
阅读正确从第 21 个 block 续上。

版本号按 `CLAUDE.md` 的规则升级到 0.2.0（MINOR：新增了一个用户可见能力），
大版本号继续停在 0。

## 2026-08-01 —— read ahead 忘记 build；status 目录补齐层级标题、加剩余分钟数

用户反馈"选 read ahead 时没看到 recap"，排查后发现是虚惊一场：用户在测试的是
链接过的 `kuibu` 全局命令，推送 recap 功能后忘了重新 `npm run build`，跑的其实
是旧编译产物——直接复现过一遍相同场景（先完成只读 4 个 block 的打卡，再选
read ahead）确认代码本身没问题，recap 正常显示。

顺带两个真实的小改进：

1. `status` 的目录之前只有叶子小节（1.1.1、1.1.2……），漏了原书自己的章/节
   标题（"1 Building Abstractions with Procedures"、"1.1 The Elements of
   Programming" 等）。这些标题其实源文件里已经有干净的标签
   （`<h2 class="chapter">`/`<h3 class="section">` 的 chapnum/chaptitle、
   secnum/sectitle），纯机械提取，不需要人工/LLM 参与——新增
   `TexinfoHtmlAdapter.extract_section_headings` 和 schema 类型
   `SectionHeading`（`path`/`title`），`core/tableOfContents.ts` 改成按
   `section_path` 的每一级前缀查表插入标题行，配合缩进画出正确的层级关系；
   章节引言的合成路径（"1.0"）在表里查不到对应标题，自然不会插入，不需要
   特殊处理。
2. 剩余阅读时间估计除了"还要几天"，现在也顺手显示"总共还要读大约多少分钟"
   （`core/completionEstimate.ts` 新增 `estimateMinutesRemaining`，和天数估计
   共用同一个"剩余总秒数"计算）。

版本号：这两个都算已上线的 `status` 命令的细节补全/体验改进，不是全新能力，
按 `CLAUDE.md` 的规则算 PATCH，升到 0.2.1。

## 2026-08-01 —— 正文标题改成增量式、断点续读补 "..."、recap 加目录定位

用户反馈：每个 block 都打印完整的 `Chapter 1 › 1.1 › 1.1.3` 路径，跟真书排版
很不一样——同一小节里连续几个 block 会把同一串路径重复打印好几遍。改成增量式：
只在章/节/小节号相对上一个 block 变化的那一级开始，才打印从那一级往下的标题；
同一小节内连续的 block 之间完全不重复标题。章一级固定带 `Chapter N` 前缀，
其余层级只写编号本身，靠缩进（不是重复的前缀）表达层级关系——`cli/renderBlocks.ts`
新增 `computeHeaderLines`，用"跟上一个 block 的 section_path 第一个不同的层级
在哪"来决定这次要新打印哪些层级的标题，中间层级的标题文字取自
`pack.section_headings`（跟 `status` 目录用的同一份数据）。

顺带两个相关的小改进：

1. 如果今天的阅读是接着某天断在小节中间的位置继续（而不是正好从小节边界
   开始），第一个 block 的标题下面会补一行 `...`，提示"这里之前还读过一部分，
   不重复打印"——不需要把已读过的正文再显示一遍，也不会让人误以为这个小节
   是从头开始的。判断方法：今天第一个 block 的 section_path，是否有另一个
   block 落在同一个小节里且已经被读过。
2. `Recap` 环节的头部现在也打印一份跟 `status` 一样的目录（`renderTableOfContents`
   + `→ ... (you are here today)`），用户在看回顾文字之前先看到自己在全书里的
   具体位置，不用再手动跑一次 `status`。

正文本身的缩进（用户原话"如果太复杂就不做也行"）没有做——多行 Markdown 里
嵌着 Scheme 代码块，额外套一层统一缩进容易和代码本身的对齐搅在一起，权衡下
来收益不足以抵消复杂度。

对着真实 SICP 内容包手动验证了一遍：day 1 从头读，正确打印出完整的
`Chapter 1 → 1.0.2` 链条；伪造一条今天的 checkin 事件后选 "read ahead"，
Recap 的目录正确用箭头标出 `1.0.2`（昨天只读了这个小节 2 个 block 里的 1 个），
正文头部也正确在 `1.0.2` 的标题下面补了 `...`，随后进入 `1.1` 时标题恢复正常
增量显示。

版本号：这些都是已上线的阅读/回顾流程的显示方式调整，不新增能力，按
`CLAUDE.md` 的规则算 PATCH，升到 0.2.2。
