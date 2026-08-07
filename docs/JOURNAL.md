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

## 2026-08-01 —— 补回正文缩进

用户试用后反馈：标题格式满意，但正文还是顶头显示的，跟上一条日志里"跳过缩进"
的决定相反——明确要求正文按所处章节做缩进。补上：`cli/renderBlocks.ts` 新增
`indentContent(content, indent)`，给正文每一行加统一前缀，深度比这个 block
自己的小节标题再深一级（跟 "..." 续读提示用的是同一个缩进量），空行不加
前缀避免行尾空白。因为只是给每一行加恒定前缀，Scheme 代码块内部的相对缩进
不受影响，只是整体跟着正文一起右移。

对着真实 SICP 内容包手动验证：普通段落、列表、以及 `486`/`(+ 137 349)` 这类
`​```scheme` 代码块，缩进都正确跟随所在小节的层级深度，代码块内部格式没有被
破坏。

版本号：同一个显示特性的补充完善，按 `CLAUDE.md` 的规则继续算 PATCH，升到
0.2.3。

## 2026-08-01 —— 缩进只对了第一行，续行顶头——改成手动断行

用户反馈上一条日志里的缩进"只有首行缩进，第二行开始又顶头了"。根因：
`content_md` 里一个段落本身就是不含换行符的一整行长文本，之前的
`indentContent` 只在这一整行的开头加前缀；这行长到超过屏幕宽度时，终端会
自己在屏幕边缘折行，而终端的自动折行不认识"这行其实有个缩进"，续接的部分
自然贴着屏幕左边——肉眼看就是"第一行缩进、后面顶头"。

修复：不再依赖终端自动折行，`indentContent` 改成自己按 `width - indent长度`
手动断行（贪心断词算法 `wordWrap`），断出来的每一行都单独加前缀再输出。
代码块（```scheme ... ```）内部不参与断行，只整体加前缀——重新折行会打乱
代码本身的换行和缩进，索性保持代码块原样，只是跟着一起右移。`width` 优先用
`process.stdout.columns`（真实终端宽度），拿不到时（比如输出被重定向）退回
80 列。

对着真实 SICP 内容包重新验证：普通段落现在每一行都带缩进，在 100 列宽的
终端下正确按约 80 列（含缩进）断行；`486`、`(+ 137 349)` 这类代码块整体
保持原样，没有被重新断行。

版本号：修复上一次功能里的一个视觉缺陷，按 `CLAUDE.md` 的规则算 PATCH，
升到 0.2.4。

## 2026-08-01 —— 代码块的 ``` 围栏在 Windows 终端里纯属噪音，换成文字提示

用户反馈：``` ```scheme ``` 这种 Markdown 代码围栏在他的 Windows 终端里啥效果
都没有，反而显得多余——终端不解析 Markdown，这两行光秃秃地杵在那里，不高亮
也不成框。要求兼顾 Windows/macOS 终端兼容性的同时找最佳显示效果，用户自己
提的兜底方案是"干脆去掉 ```，换成人话提示接下来是代码"。

选的正是这个兜底方案，而不是 ANSI 颜色或 Unicode 画框：`indentContent` 不再
打印围栏行本身，开头围栏换成一行纯文本 `Code (scheme):`（围栏后面跟了语言名
就用语言名，没有就是 `Code:`），结尾围栏直接省略——代码结束后原文里本来就有
的空行已经足够当分隔。纯 ASCII 文本不用担心任何终端的 ANSI/Unicode 兼容性
问题，代价是牺牲一点"好看"，换来的是哪台终端都能正确显示。

对着真实 SICP 内容包验证：`486`、`(+ 137 349)` 这些代码示例前面正确显示
`Code (scheme):`，围栏行本身不再出现在输出里。

版本号：同一个显示特性的进一步调整，按 `CLAUDE.md` 的规则继续算 PATCH，
升到 0.2.5。

## 2026-08-01 —— 代码块上下加窄边界线

用户对上一条日志里"去掉围栏、换成 `Code (scheme):` 文字提示"的方案满意，
再提一个小要求：代码上下用 `---` 画一条边界线看得更清楚，但边界线宽度按
代码本身的宽度来、够盖住代码就行，不要拉满整个屏幕——太宽会让人误以为是
分页/分节用的横线。

`indentContent` 改成先把一个代码块内的所有行缓冲下来（`codeLines`），闭合
围栏那一刻才知道这个代码块里最长一行有多长，一次性吐出"标签 + 边界线 +
代码 + 边界线"：

```
Code (scheme):
-----------
(+ 137 349)
486
-----------
```

边界线宽度 = 代码块内最长一行的字符数（不含缩进），而不是终端宽度。

对着真实 SICP 内容包验证：单行的 `486` 例子边界线短（3 个 `-`），多行的
`(+ 137 349)` / `486` 例子边界线跟着最长的那一行走，都没有拉满屏幕。

版本号：同一个显示特性的进一步调整，按 `CLAUDE.md` 的规则继续算 PATCH，
升到 0.2.6。

## 2026-08-02 —— 阶段二启动：EpubAdapter 设计定稿

用户提出要开始做 EpubAdapter/多本书功能——这在 `docs/MILESTONES.md`/`DESIGN.md` §10
里原本白纸黑字标的是"阶段二"工作，且 M4 的"连续打卡 21 天"还没打勾。问清楚后确认：
用户是有意把这个提前，两条线并行推进（SICP 打卡继续是阶段一验收指标本身，EpubAdapter
是阶段二第一块拼图，独立推进不互相阻塞），不是我自己临场决定要不要提前。

三个决策点问清楚后拍板：

1. **文档**：不是简单挪一条 bullet，而是把 EpubAdapter 按阶段一材料的详细程度重新写
   一份设计（`docs/DESIGN.md` 新增 §14），`MILESTONES.md` 阶段二也从一行 bullet list
   拆成跟 M0–M4 同规格的 checkbox milestone（"阶段二 M1"）。
2. **多本书事件日志隔离**：不改事件 schema（会碰到已经产生真实数据的
   `.kuibu-events.jsonl`），改成每本书一个独立日志文件，`--log` 默认值按 `--pack`
   目录名自动推导（SICP 默认路径保持向后兼容不变），并在加载时校验日志已有的
   `book_id` 跟当前 pack 是否匹配，不匹配拒绝运行——现状里这个校验完全不存在，属于
   顺手补的安全网。
3. **推进节奏**：先用 The Great Gatsby 前几章验证 EpubAdapter 解析→切块→出题→recap
   全链路，跑通后再铺开全书，不追求今天一次性做完整本——跟当年 SICP 先做 1.1 一节
   再铺开同一个套路。

动手写设计之前，先实测下载了 Project Gutenberg 的 Gatsby epub（ebook #64317）解压查看
真实结构，避免设计建立在猜测上——发现它跟 SICP 源码的"每小节一个文件"完全不同：全书
内容摊在 spine 里的 3 个 xhtml 文件（页眉+第 I–V 章 / 第 VI–IX 章 / 纯 Gutenberg 版权
样板），每章是 `<div id="chapter-N"><h2>罗马数字</h2><p>...</p></div>`，`<hr/>` 是章内
场景分隔不是新章节。这些实测细节直接写进了 §14.3 的 `EpubAdapter.parse()` 策略。

顺带确认：小说没有 SICP 那种原书 Exercise，`exercises` 直接空数组，不需要任何
schema/代码改动；小说 `section_path` 只有"章"一级，比 SICP 的三级浅得多，但 schema
本身没有固定深度限制，不用改。

## 2026-08-02 —— 阶段二 M1 完成：EpubAdapter 跑通，Gatsby 第一章可读可打卡

用户拍板设计后明确要求"接下来我要离开一会儿，到完成所有 6 个 step 之前都不要问我
问题"——一次性把 M1 的全部实现工作做完，中途不再停下来确认。

1. **`EpubAdapter`**（`pack-gen/generator/epub_adapter.py`）：`zipfile` 读 epub，
   `xml.etree` 解析 `META-INF/container.xml` + `content.opf` 拿到 spine 顺序，
   `BeautifulSoup` 按 `<div id="chapter-N">` 找章节（正则取 id 里的数字当章号，
   不用猜罗马数字怎么转换）。诗体引文（`<br/>` 分行 + `<cite>` 落款）、一处
   作息表 `<table>`、章内 `<hr/>` 场景分隔符都是 SICP 源码里没见过的结构，专门
   处理：`<hr/>` 渲染成一行 `* * *` 标记（不然连续两个场景会在阅读时毫无提示地
   粘在一起）。合成 fixture epub 写了 15 个单元测试，另外对照真实下载的 Gatsby
   epub 做了 3 个冒烟测试（九章顺序、开篇第一句、无 Gutenberg 样板泄漏）。
2. **`split_gatsby.py`**（镜像 `split_sicp.py`）机械切出全书 9 章到
   `build/gatsby/sections/`——这一步不花钱不花时间，9 章一起切没有代价，
   跟"这轮只做第一章"的节奏决定不冲突。
3. **手工产出第一章内容**（人工代 LLM，跟 SICP 同一套流程，还没接真实 API）：
   14 个 block（按 ~2-3 分钟/块、尊重原文两处场景分隔手工断的），11 个知识点，
   11 道单选题（干扰项是"看漏了/记错了细节"级别的常见误判，不是荒谬选项）。
   `build_gatsby_section.py`（镜像 `build_section.py`）跑 `slice_section` 切出
   `pack-parts/1.json`，人工核对过 block/item/question 交叉引用完整性，并抽查了
   切出来的 `content_md`——场景分隔标记和结尾"green light"那段名场面都跟原文
   逐字一致。
4. **组装 `packs/public/gatsby/`**：`manifest.json` 标明来源是 Gutenberg
   ebook #64317、公有领域；`section_headings.json` 是空数组（小说只有"章"一级，
   没有更高层级需要额外标题行，DESIGN.md §14.2 已经讲过为什么这是对的而不是
   漏做了）；`recap_checkpoints.json` 复用 `compute-recap-boundaries.ts`（这次
   顺手把它从写死 SICP 路径改成接受 pack 路径参数，验证过零参数调用跟改之前
   结果完全一致，35 个 checkpoint 一个不差）算出 3 个切分点，手写了 3 段
   累计压缩式回顾。两侧 schema 校验（Python pydantic + TS ajv，走的是
   `cli/loadPack.ts` 真正运行时用的那条路径，不是另开一条校验逻辑）都过。
5. **多本书日志隔离**：`cli/index.ts` 新增 `defaultLogPath`——不传 `--log` 时
   按 `--pack` 目录名推导（`packs/public/sicp` 继续用 `.kuibu-events.jsonl`，
   其他包用 `.kuibu-events-<name>.jsonl`）；新增 `cli/logGuard.ts` 的
   `assertLogMatchesPack` + `core/reducer.ts` 的 `findLoggedBookId`，加载时
   校验日志里已有的 `book_id` 跟当前 pack 是否一致，不一致直接拒绝运行——
   手动验证过：故意用 `--pack packs/public/gatsby --log .kuibu-events.jsonl`
   （真实的 SICP 日志）会被正确拦下，报错信息里点明是哪本书、该怎么修。
6. **端到端验证**：拿一次性 `--log` 跑了完整的 `kuibu today --pack
   packs/public/gatsby`，从头到尾走一遍（首次目标提问 → 阅读 → 2 道复习题 →
   打卡 → 年历），单级 `section_path` 下 "Chapter N" 标题行、缩进、场景分隔、
   选项 shuffle 全部正常，没有为小说改一行 `cli/renderBlocks.ts`——DESIGN.md
   §14.2/14.5 事先分析过这一点应该成立，这次是实测确认。另外单独用一次性
   `--log` 跑了默认 SICP 路径两遍（首次 + 打卡后重开选 review），确认这次改动
   没有影响 SICP 的默认行为；`status`（不传任何 option）确认没碰真实的
   `.kuibu-events.jsonl`，读完之后文件行数没变。

全程 TypeScript 168 个测试、Python 36 个测试保持全绿，每步都单独 commit。

版本号：新增了一本可以真正打卡阅读的书（`kuibu today --pack packs/public/gatsby`），
是用户可见的新能力，按 `CLAUDE.md` 的规则算 MINOR，升到 0.3.0（大版本号继续停在 0，
阶段一还没到"基本可用"那个由用户判断的时间点）。

## 2026-08-02 —— 一次真实的日志串号事故 + 两个多本书易用性补丁

用户实测报告"第一次读 Gatsby 就是从中间开始的"，怀疑是不是串用了 SICP 的记录。
排查后确认：**不是设计如此，是真的串了**——全局链接的 `kuibu` 命令指向 `dist/`，
而 `dist/` 是今天上一条日志（M1 六步）改完 `cli/index.ts` 之后忘了 `npm run build`
的旧编译产物，还是 0.2.6 时代"没有按 pack 派生默认 --log、没有 book_id 校验"的
老代码。旧代码跑 `kuibu today --pack packs/public/gatsby` 时，`--log` 默认值仍然
硬编码指向真实的 `.kuibu-events.jsonl`（SICP 的日志）；而两个内容包的 block id
恰好都从 `b0001` 起步，reducer 把 SICP 已读的 `b0001`-`b0004` 当成"Gatsby 前 4 块
也读过了"，于是 `packSession` 从 Gatsby 第 5 块开始打包——这就是用户看到的"从中间
开始"。真实伤害：SICP 日志混入了 2 条 `book_id: "gatsby"` 的 `session_start` 和 5 条
`b0005`-`b0009` 的 `block_read`（没有伪造 checkin，streak 本身没坏，但 SICP 的阅读
进度状态被污染了）。修复：把 `.kuibu-events.jsonl` 精确恢复到事故前的 9 行（这份
日志此前在对话里出现过，内容可以逐行核对），重新 `npm run build` 刷新全局链接。

顺带确认了一件事：这不是这次新加的"多本书日志隔离"功能本身设计有问题——功能代码
是对的，只是没被跑到；`npm link` 指向编译产物这个事实本身在 2026-08-01 的日志里
已经踩过一次坑（那次是"改完 recap 忘记 build，看起来像功能没生效"），这次是同一个
坑的更严重版本（这次是真的写脏了数据，不只是显示旧内容）。

用户接着提了两个真实的日常易用性问题：

1. **`kuibu today --pack packs/public/gatsby` 太长**——新增 `cli/discoverPacks.ts`
   的 `discoverPacks()`，扫 `packs/public/`（+ `packs/private/`，如果存在）下所有
   带 `manifest.json` 的目录，按 manifest 里的 `book_id` 建立"短名 → 目录"的映射，
   不需要另开一份注册表文件人工维护同步——新书目录一旦存在就自动被认出来。
   `resolvePackDir()` 让 `--pack` 既认完整路径（老用法不受影响）也认短名：
   `kuibu today --pack gatsby` 现在就够了，`--log` 仍然按解析出来的真实目录走
   之前那套按 pack 派生默认值的逻辑。
2. **`status` 只显示一本书，以后书多了怎么办**——新增 `kuibu books` 命令，列出
   `discoverPacks()` 找到的每一本书，各打印一行"连续天数 / 今天是否打卡 / 阅读
   进度"摘要。这个命令不需要因为"加了第三本书"而修改代码——扫描是自动的，Chinese
   novel、用户私有 epub 以后接入后会自动出现在这张列表里。

实现过程中自己抓到一个真实 bug，没等用户发现：`discoverPacks()` 用
`node:path` 的 `join()` 拼路径，在 Windows 上产出反斜杠分隔的字符串
（`"packs\public\sicp"`），而 `cli/index.ts` 的 `defaultLogPath()` 判断"这是不是
默认的 SICP pack"用的是跟硬编码字符串 `"packs/public/sicp"`（正斜杠）的严格
`===` 比较——两种分隔符风格的字符串永远不相等，导致 `kuibu books` 或
`--pack sicp`（短名）会把 SICP 误判成"陌生的新书"，算出一个从未存在过的
`.kuibu-events-sicp.jsonl` 空日志，展示出跟真实进度完全对不上的"0% 已读"。
在提交前的自测里发现了这个不一致（`books` 显示 SICP 3% 变成了 0%），修成
`discoverPacks()` 统一吐出正斜杠路径，加了一条专门盯着这个回归的测试。

版本号：`kuibu books` 是新命令、`--pack` 接受短名是新的用户可见能力，按
`CLAUDE.md` 的规则算 MINOR，升到 0.4.0。

## 2026-08-02 —— 阶段二 M2：Gatsby 铺开到全书 9 章

用户拍板"把 Gatsby 剩下的所有章节都做完"。第一章（M1）已经验证过整条链路，
这次是纯粹的规模化：8 个并行 subagent（`Agent` 工具，`model: "sonnet"`，各自
独立跑在后台）各写一章（II–IX），每个都拿到同一份任务简报——第一章的
`llm-output/1.json` 当具体范例、`section_prompt.md` 当规格、目标 block 大小
~400-600 词（~200 wpm，跟 SICP 那套技术阅读速度换算完全不同）、场景分隔 `* * *`
折进上一个 block 收尾、知识点覆盖大部分 block、干扰项要"半对半错"级别的常见
误判、explanation 必须逐字引用原文。Chapter VII（419 段，是其他章的~3倍，
Plaza 对峙+车祸那章）明确告诉它按比例产出更多 block，不要为了凑数压缩。

8 个 agent 全部拿到之前，先把合并脚本写好（`build_all_gatsby_sections.py`，
镜像 `build_all_sections.py`，SECTION_ORDER 1-9，单一递增 `IdCounters`）——
这一步不依赖 agent 产出，可以并行准备。全部 8 章交上来后（每个都在自己的
输出里跑了 pydantic 校验和段落覆盖检查，Chapter IX 那个 agent 甚至自己抓到
并修好了一处引用错误的原文摘录），跑合并脚本：118 blocks / 125 items /
125 questions。**验证了一个不能出错的不变量**：Chapter I 的 id（b0001-b0014
等）在整本书重新合并后完全没变——因为 `build_all_gatsby_sections.py` 按章节
顺序处理、Chapter I 排第一个，即使它的缓存因为格式差异（旧版 `build_gatsby_
section.py` 产出的 `pack-parts/1.json` 没有 `_input_hash` 字段）触发重新生成，
从零开始的 `IdCounters` 处理第一章时算出来的 id 也是同一套——这是设计上的
巧合还是必然，取决于 Chapter I 永远排第一个这个事实，值得记一笔。

`packs/public/gatsby/` 的 `blocks.json`/`items.json`/`questions.json` 整体
覆盖成全书内容，两侧 schema（pydantic + `cli/loadPack.ts` 的 ajv 路径）都验证
通过。

`recap_checkpoints.json` 是这次唯一没有交给 agent 的部分——跟 SICP 35 条
checkpoint 当年的道理一样，回顾必须逐条累积压缩，天然是顺序任务。重新跑
`compute-recap-boundaries.ts` 对着全书 118 个 block 算边界时发现一个反直觉的
结果：**M1 写的前 3 条 checkpoint 的边界本身也变了**（第 3 条从"到第 14 块"
变成"到第 15 块"）——`packSession`（回顾切分复用的同一个函数）纯按时长贪心
打包，不认章节边界，M1 时只有 14 个 block 存在，"这一天"自然在第 14 块结束；
现在第 15 块（第二章开头）也可用了，同一个时长预算能多装进一块，边界就跟着
往后挪。这意味着不能假设"新增内容只会在后面追加 checkpoint"，22 条全部
从头重写，没有复用 M1 那 3 条的文字。

端到端验证：不能直接跑用户真实的 `.kuibu-events-gatsby.jsonl`（那是真实进度），
拷贝一份一次性副本测试"打卡后重开选 read ahead"——正确从 block 5 接着读
（不是从头开始，也没跳过内容），recap 正确定位到 checkpoint 1（此时只读过 4
块），问答/打卡/日历全部走通。中途犯过一次测试方法上的错误：把同一个命令对
同一份（会被写入的）日志文件跑了两次，产出的 block 范围看起来像 `packSession`
超出了预算一倍多，一度怀疑是 bug——重新用干净的单份日志、单次调用复现后发现
是两次调用的结果被误当成了一次来看，`packSession` 本身完全按预期在预算内停止。

版本号：全书内容覆盖是实质性扩展（4 分钟的一章 → 4 小时的全书），按
`CLAUDE.md` 的规则算 MINOR，升到 0.5.0。

## 2026-08-02 —— 阶段二 M3：中文小说选型两次反复，西游记前 10 回

用户要求接入第三本书：中文小说，先做约 10 天内容试读。第一次选了鲁迅《朝花夕拾》
（散文集，公有领域），下载遇到真实阻碍——Wikisource 官方 epub 导出工具
（ws-export.wmcloud.org）挡着一层 Anubis 反爬虫 JS 验证码，`curl` 过不去。找到一条
绕行路径（直接对 zh.wikisource.org 按 `action=raw` 取每页 wikitext，不走导出工具），
正准备用 MediaWiki API 查规范页面标题列表时，用户主动打断：读过资料后觉得这本书
不够合适，改换目标为吴承恩《西游记》，其余要求不变（先做 10 回）。`朝花夕拾` 的
半成品源文件和抓取脚本全部删除，没有留下任何痕迹进 `packs/`。

西游记（Project Gutenberg ebook #23962）下载顺利，一个真实 epub 文件，但解压检查后
发现结构跟 Gatsby 完全不同——Gatsby 是"ebookmaker 从 HTML 源转换"，靠
`<div id="chapter-N">` 分章节；西游记是"从纯文本 `.txt` 源转换"，正文就是一串平铺
的 `<p>`，章节标题跟样板起止标记都不在任何 `<div>` 容器里。第一版实现在 `<p>`
里搜索起止标记文本，一个都没匹配上（因为标记实际是裸 `<span>`）——排查后改成
先在原始字符串层面按子串定位裁剪，再交给 BeautifulSoup 解析。章节数字写法本身
不统一（标准数字/逐位读数/用"○"代替十位的零都出现过，同一本书里混用），干脆不
解析数字本身，只按遇到标题的顺序自己编号——原文标题字符串照原样存进
`section_title`，读者看到的还是原文。新写的 `GutenbergTxtAdapter` 详见
`docs/DESIGN.md` §14.8。顺手把 `epub_adapter.py` 里跟 zip/OPF 解析、`<br/>` 保留
换行的内联渲染有关的代码抽成 `epub_zip.py`/`html_text.py` 两个共用模块——第二个
adapter 出现后这是真实重复，不是投机式提前抽象。

第一回手工authored（block 切分 + 知识点 + 复习题 + recap，全部中文），当参考范例；
第二至十回交给 8 个并行 subagent，每个都被要求对着机械切分产物核实情节细节、不能
只凭对故事的一般印象——这本书流传版本多、情节细节容易记错（比如陈光蕊故事的具体
桥段、第 9-12 回的分卷差异）。

组装阶段自己做了一次 QA，意外挖出一个系统性问题：`recap_md`/题目/`explanation`
这些作者自己写的字段，我和全部 8 个 subagent 都默认用简体字打字，跟原文的繁体字
风格不一致；而且更深一层，检查 `explanation` 里号称"逐字引用原文"的短句是否真的
是原文子串，发现 120 道题里约一半对不上——很多是凭理解转述后加了引号，不是真的
逐字抄的。装了 `opencc-python-reimplemented`，把全部作者自己写的字段批量转成繁体，
解决了字体不一致（一次性脚本，转完即删）；但"是不是真的逐字引用"这个更深的问题
没有批量修——转字体不能把一段转述变成真的原文子串，需要逐条核对原文才能修，量
太大（约 60 处），这次会话里诚实标注为已知问题，没有隐瞒式地假装做到了要求的
精确度。

多本书日志隔离、`packSession` 边界计算等机制跟 Gatsby M2 完全复用，没有新代码；
`book_id` 定为 `xiyouji`，简短好打。版本号/`MILESTONES.md` 这次故意不升级/不打
钩——这是一批等用户验收的预览内容，不是已完成的里程碑，参考 Gatsby M1 当时"做完
就升级"的先例，这次因为用户明确要求"先给我验收"，验收结论出来之前不能假装已完成。

## 2026-08-02 —— 权限设置：从"分类补全"到"整体放开"，再补 WebFetch 的漏网之处

用户反馈"今天开发过程中被问了很多次权限问题，虽然每次都同意了，但还是反复被问"。
排查 `.claude/settings.local.json`（发现这是 Claude Code 自己的权限自动记录草稿
文件，会被工具调用不断改写）后发现：之前每次用户批准一个命令，记的都是接近字面
匹配的窄规则（比如 `Bash(git commit -m ' *)"` 只匹配 `-m '` 后面跟单引号的写法），
换个引号风格或换个文件名就又要重新问一遍。第一次修复：把常用类别（python/pytest/
npx/npm/git commit/rm/cp/chmod 等）整理成宽泛的前缀规则写进 `.claude/settings.json`
（提交进 git 的项目级文件，不是会被自动改写的 local 文件）。

修完之后同一个 session 里又被问了几次，用户第二次反馈"不应该再问了"。这次直接放
弃分类枚举，改成 `Bash(*)`/`PowerShell(*)` 整体放行，只保留 `CLAUDE.md` 自己的
Git Safety Protocol 点名的几个真正危险操作（push、reset --hard、clean -f、
branch -D、checkout 一整棵树、restore 一整棵树）留在 `ask` 列表里——这几个即使
在整体放行之下也应该继续确认，不是权限设置能不能覆盖的问题，是这几个操作本身
该不该被无条件允许的问题，值得用规则挡一层，而不只是靠自己每次记得。

第三次反馈时（"刚刚又有几次问我权限问题"）排查发现 `Bash(*)`/`PowerShell(*)` 这条
整体放行只覆盖了这两个工具本身——`WebFetch` 是完全独立的工具，权限模型是按域名
单独授权的（`WebFetch(domain:zh.wikisource.org)`），不会被 shell 层面的通配规则
覆盖到。补了一条裸 `WebFetch` 规则（不限域名），顺手把 `Agent`/`Read`/`Write`/
`Edit`/`Glob`/`Grep` 也加成整体允许，覆盖用户"这个项目里什么都不要问"这条明确
表达过两次的诉求。这次顺带确认了一件事：同一批日志里还留着几条 `curl`/`pip
install` 的窄规则，但那些是第一次反馈之前（朝花夕拾调研阶段）留下的历史记录，
不是 `Bash(*)` 生效之后仍然存在的漏洞，没有继续处理。

## 2026-08-04 —— 阶段二 M4：私有书基础设施 + 《史蒂夫·乔布斯传》预览批次

用户拍板下一本书是私有书（版权不允许公开的《史蒂夫·乔布斯传》，沃尔特·艾萨克森
著），要求先按类似西游记的策略搭一套跟 `packs/public/` 并行的私有书存放与生成
结构。先给出五步计划（隔离基础设施 → 确认书目与源结构 → adapter + 机械切分 →
前几章预览 → 铺开全书）征求用户确认，每步一个验收点，用户认可后按计划推进。

**Step 1：隔离基础设施**（跟内容无关，先行验证不涉及任何具体书）。发现
`packs/private/` 这条路径其实已经在 `.gitignore`/pre-commit hook/`discoverPacks()`
里就绪，缺口全在 pack-gen 一侧：`pack-gen/sources/`、`pack-gen/build/` 对公开书是
逐本手动列 gitignore 行（且故意保留 `llm-output/` 不被忽略，因为是值得保护的
手工产出），私有书需要反过来——源文件和全部构建期中间产物（包括 `llm-output`，
这里是从受版权保护原文派生出来的内容，一行都不能进 git）都要整体忽略。新增两条
wholesale 规则 `pack-gen/sources/private/`、`pack-gen/build/private/`，让以后任何
新私有书都不用再碰 `.gitignore`。测试阶段用户提供的真实文件
（`乔布斯传.epub`，中文文件名）意外暴露一个真实漏洞：git 默认给非 ASCII 文件名
加双引号并转义成八进制（`"pack-gen/...\344\271\224...epub"`），pre-commit hook
锚定在行首的正则被这个前导引号挡住，导致中文文件名的私有文件完全漏检——用
`-c core.quotePath=false` 修好，强制 `git diff` 原样输出路径。

**Step 2-3：书目确认 + adapter**。解压检查真实 epub 后发现这是第三种结构（跟
Gatsby 的 `<div id="chapter-N">` 多章一文件、西游记的单文件平铺 `<p>` 都不一样）：
51 个 spine 文件，每个文件是独立一节，靠单一 `<h3>` 标题标签 + 平铺 `<p>`——反而
是三者里最简单的。跟用户确认内容范围（前言 + 41 章 + 尾声收录，封面/目录/作者
简介/致谢/摄影集/封底跳过）后新写 `PerFileEpubAdapter`，复用已有的
`epub_zip.py`/`html_text.py`（第三个 adapter 复用，进一步验证抽取这两个模块
不是过早抽象）。测试阶段抓到源文件自己的一个真实缺陷：`<spine>` 里
`chapter32.html`（第二十六章 iMac）排在 `chapter31.html`（第二十五章 设计原则）
前面，文件名和标题文字里的数字都对不上——大概率是 Sigil 重建这份 epub 的
`content.opf`（文件里留着"Your OPF file was broken so Sigil was forced to
create a new one from scratch"的注释）时手误调换了两条 `itemref`。这本书的
章节数字写法本身规整（不像西游记那样需要"不信任原文数字"的防线），所以在
`split_sjobs.py` 里写了个小型中文数字解析器，按解析出的真实章节号重排修正，
不在 adapter 里做（那是这本书独有的数据质量问题）。

**Step 4：前言 + 前两章预览批次**（用户要求的范围）。手工读完全部 121 段原文，
切出 36 个 block、写 36 条知识点、36 道题、9 条 recap checkpoint——这次刻意
吸取西游记 M3 的教训，每道题的 `explanation` 引用都是我读原文时逐字摘出来的，
用脚本核实过 block 的段落边界完整覆盖每一节、无缝无重叠、所有下标交叉引用
合法，不是事后自称"核对过"。组装阶段又抓到一个真实的私有内容泄漏风险：
`compute-recap-boundaries.ts` 原来把输出路径硬编码成 `pack-gen/build/<bookId>/`，
这对公开书没问题（每本单独进了 gitignore），但完全绕开了刚加的
`pack-gen/build/private/` wholesale 规则——真跑起来会把从版权内容派生的
`recap_md` 写到一个 `.gitignore` 完全不认识的路径。改成按 pack 路径是否含
`private` 分支决定输出目录，修好后两侧 schema 校验通过，`kuibu today --pack
sjobs`（临时日志，用完即删）完整走了一遍。

**用户验收反馈两个真实 bug，当场修复**：① 前言被标成了"Chapter 1"——
`section_path` 最初按解析顺序编成 `"1".."43"`（前言=1），`renderBlocks.ts` 的
`computeHeaderLines` 无条件给顶层加"Chapter N"前缀，前言因此跟真正的第一章
撞了号。改成前言/尾声用非数字的 `"foreword"`/`"afterword"`，数字章节用解析出的
真实章节号；渲染器只在顶层编号是纯数字时才加"Chapter"前缀，非数字编号只打印
标题本身。② 中英文混排的地方英文词组会被莫名从中间换行——根因是旧版
`wordWrap` 按 `.length`（不是终端显示列数）判断宽度，且把一整段没有空格的中文
当成*一个词*（中文本来没有空格），这个超长未测量的"词"直接塞进一行，第一次
真正有机会换行是下一个空格处——往往就落在紧跟着的英文词组中间（比如"研究中心
(NASA Ames Research Center)"会断在 NASA 和 Ames 之间）。改成中文逐字拆分成
可断行的最小单元、宽度按显示列数算（复用给 `kuibu books` 表格对齐用的
`textWidth.ts`），用真实报告的两处原文（NASA Ames Research Center、The
Lockheed Missiles and Space Division）验证修好；补充测试覆盖两个 bug 各自的
回归场景。全程 187 个 TS 测试 + 69 个 Python 测试 + typecheck 保持全绿。

版本号/`MILESTONES.md`：跟西游记 M3 同样的先例，这是等用户验收的预览批次，
不升版本号；`MILESTONES.md` 新增"阶段二 M4"小节记录已完成的部分，不打勾。

## 2026-08-05 —— 阶段二网页版 W0-W4：从部署链路到暗色模式 + PWA

用户带着一份自己写好的详细任务简报开场（`docs/history/2026-08-05-kuibu-web-brief.md`，
不是 Claude 起草的——特意说明这一点是因为简报里的技术选型、UI 规格、"已知的坑"
清单都是用户直接决定好的，Claude 的角色是照着执行并在执行中发现简报没预料到
的地方）。简报自带节奏：一次做一个 W-step，每步做完用户实机试用、明确说"继续"
才推进下一步——这条节奏在整个过程里被完整遵守，中间连续 5 次"push it"都是
用户在看过部署结果之后主动说的，不是 Claude 自己判断"应该没问题"就往下推。

### W0：部署链路，先把最难的一环走通

简报要求先把"能不能部署"这件事跑通，再往里填内容。第一个意外：仓库当时是
私有的，GitHub Pages 对私有仓库要收费——这是简报写作时没考虑到的现实约束，
停下来用 `AskUserQuestion` 让用户在"仓库改公开"/"升级 GitHub Pro"/"换成
Netlify 等平台"三个选项里选，用户选了改公开（内容本身一直是公有领域书，
改公开的风险主要是提交历史一并可见，用户判断可以接受）。改之前先用
`git log --diff-filter=A` 核实了 `packs/private/`/`packs-private/` 从未被
commit 过，不是走个形式。

第二个意外：当前 `shadcn` CLI（v4.16.1）已经把简报写作时假设的"init 时选
一个 base color（stone/zinc/gray……）"这套交互流程整个换掉了，改成一整套
具名 preset（Nova/Vega/Maia……），不再有单独的中性色选择步骤。没有硬套一个
preset 敷衍过去，而是用装好的 `nova` preset 生成的 CSS 变量结构为骨架，手动
把每一个中性色 token 换算成 Tailwind 真实的 `stone-*` 数值——特意从
`node_modules/tailwindcss/theme.css` 里核对具体数字，不是凭记忆编几个近似
色。顺手去掉了 preset 自带的 Geist 网络字体（简报明确要求"不引入任何 web
font"），换成简报指定的系统字体栈。

`web/` 与 `cli/`/`core/` 平级放置，直接用相对路径 `import` `core/*.ts` 和
`schema/types/*.d.ts`——这是第一次真正验证"`core/` 零 IO、CLI 与网页版共用
逻辑"这条铁律在实践中真的成立，不只是文档里的一句宣称。GitHub Actions 工作流
第一次跑通，`https://houkensjtu.github.io/kuibu/` 能访问，页面上一句话 + 一个
读了 `core/checkinDate.ts` 算出来的日期，证明整条链路（构建→部署→core 导入）
都是真的在工作，不是巧合。

### W1：四 tab 骨架 + 年历——上线后第一条用户反馈

`core/yearCalendar.ts` 的 `buildYearCalendar` 原样复用，只重写渲染层（CSS
grid 代替 CLI 的等宽字符画格）。第一版年历格子是写死的 11px，部署后用户在
真实手机上试用反馈"需要横向滚动才能看全年，不太理想"——改成用
`ResizeObserver` 量容器实际宽度、反推格子边长（3-16px 之间夹紧），年历
永远一屏放下，不再依赖滚动。这是"部署了才发现"的典型例子：本地开发时用的
桌面浏览器窗口够宽，格子大小从来没成为问题，真机窄屏才暴露出来。

### W2：阅读视图——内容管线 + 第一个只有真机测试才能抓到的 bug

新增 `web/scripts/sync-packs.js`：每次 `dev`/`build` 都从 `packs/public/`
（唯一权威数据源）重新同步一份到 `web/public/packs/`（gitignore，从不手动
复制）。这个决定是为了避免"内容包更新了、网页版读到的还是旧数据"这类
CLAUDE.md 里明确记过的"构建产物比源头还旧"陷阱。

正文渲染用 `react-markdown` + `remark-gfm` + `rehype-highlight`（只注册
scheme 一种语言，跟简报要求一致）。章节标题的"增量式"算法在 `web/src/lib/
sectionHeaders.ts` 里重新实现了一遍——跟 `cli/renderBlocks.ts` 的
`computeHeaderLines` 思路相同（只在 section_path 相对上一个 block 变化的
层级才出现标题），但返回结构化数据给 JSX 消费，不是照搬 CLI 那套面向终端
字符串的实现，因为简报 pitfall #1 明确说了 CLI 渲染层不能直接搬到网页上。
"读完了"按钮量一个总时长，按各 block 的 `est_seconds` 占比分摊，
`visibilitychange` 暂停/恢复计时。

**真正值得记下来的是这一步撞见的 bug**：`npm run build` 通过、截图看起来也
正常，但用 claude-in-chrome 起 dev server 实际操作时，才发现代码块背景色不
对——Tailwind Typography 给 `prose pre` 加了一层默认深色背景，跟
highlight.js 的 `github.css`（浅色主题）在 `code.hljs` 元素自己的白色背景
上打架，两层背景叠在一起，文字对比度很差。这个 bug 光看构建成功和普通截图
完全发现不了（截图工具在这个环境里还经常拍到滚动动画中间的过渡帧，反而
更容易误判"没问题"），是直接用 `javascript_tool` 查两层元素的
computed style 才实锤的。修法：把 `.prose pre` 的背景/内边距清零，让
`code.hljs` 自己的浅色 surface（本来就带背景和内边距）说了算。**这件事之后
定了条规矩**：这个仓库里凡是 UI 相关的改动，一律要起 dev server 用浏览器
实测（尤其是查 DOM computed style，比截图更可靠），不能只看 `npm run build`
绿了就算完——这条已经在后续 W3/W4 里被反复验证是必要的，至少还抓到了"Confirm
按钮默认应该禁用""选项高亮 class 对不对""答错时正确答案有没有高亮"这些
同样没法从构建日志看出来的东西。

顺手（不在计划内，是读原文验证代码高亮效果时偶然翻到的）发现 SICP 内容包
`packs/public/sicp/blocks.json` 里 3 个 block（`b0018`/`b0030`/`b0031`，
共 18 处）有嵌套反引号的 markdown 转义 bug，形如 `` `⟨``predicate``⟩` ``，
渲染出来是裸露的反引号字符而不是预期的 `⟨predicate⟩`。往上追到
`pack-gen/build/sicp/sections/1.1.4.json`/`1.1.6.json`——这两个文件是**机械
切分**阶段的产物，还没经过 LLM/人工加工，说明根因在
`pack-gen/generator/texinfo_html_adapter.py` 的 HTML→markdown 转换本身（大概率
是源 HTML 里嵌套的 `<code>`/`<var>` 标签没处理好），不是手写内容的笔误。
这个 bug 存在了很久却从没被发现，因为 CLI 从来不解析 markdown（直接打印
`content_md`，反引号原样印出来但混在纯文本里不显眼）——网页版第一次真正
用 markdown 渲染器渲染这份内容，才把它暴露出来。用 `AskUserQuestion` 问过
用户要不要现在就修，用户选择"先放着"（纯视觉瑕疵，不影响 CLI，也不想在
W2 中途分心去改一条已经在跑真实 21 天打卡的书的内容包）——记进了
`MILESTONES.md` 和一条独立的 memory，不是揭过就忘。

### W3：答题 + 打卡闭环——第一次在浏览器里完整打卡

`core/questionQueue.ts`（`buildQuestionQueue`/`shuffleOptions`）、
`core/scheduler.ts`（`leitnerScheduler.due`）、`core/checkinJudgment.ts`
（`isCheckinComplete`）、`core/checkinDate.ts` 全部原样复用，逐一对照
`cli/index.ts` 里的真实调用方式（`todayReadBlockIds` 传今天打包出的
block、`dueItemIds` 传 `leitnerScheduler.due` 的结果……）保证行为一致，
不是重新设计一遍。新写的 `AnswerCard` 组件严格遵守简报的交互链：点选项
只高亮（`disabled={submitted}` 挡住二次点击）、点"确认"才判分、
Confirm 按钮在没选中时禁用；shuffle 在**进入每道题时**算一次存进 state，
不是每次渲染都重算——这是简报 pitfall #4 点名"这个项目里最容易出、也最
难看的一个 bug"，写代码时就有意识地绕开了。打卡成功后 `navigate('/', 
{state:{justCheckedIn:true}})` 跳回年历，今日格子和连续天数用一个
~220ms 的 `scale` pop 过渡（只在 `prefers-reduced-motion: no-preference`
时定义这条 CSS 规则，不是"减弱版"动效，是直接不存在）。

live-browser 测试走了一遍完整闭环：读完一批 block → 答对第一题（验证
Confirm 变灰到可点、选中态 class、写入的 `answer` 事件 `correct:true`）→
答错第二题（验证正确答案高亮 `border-primary`、错选项 `border-destructive`、
解释文字出现）→ Finish check-in → 落到年历页，`streak`/`checkedInCount`
显示正确、`animate-checkin-pop` 的 class 确实加在了今日格子和连续天数上。
每一步都直接读 IndexedDB 里的原始事件核对字段，不是只看 UI 文字对不对。

### W4：暗色三态 + PWA——两次 CI 才修对的教训

暗色模式：`localStorage`（`kuibu:theme` 前缀）存 system/light/dark 三态，
`index.html` 里一段同步内联 `<script>` 在首屏绘制前就读偏好、应用 `.dark`
class，避免"先浅色闪一下再变深色"；`ThemeProvider` context 之后接管，
`preference === 'system'` 时监听 `matchMedia` 变化实时跟随系统。
highlight.js 只装了浅色主题（`github.css`），深色下没有对应主题——没有
再引入一份完整的 `github-dark.css`（两份主题的选择器都是扁平的
`.hljs-*`，很难干净地拿一个 class 去 scope 其中一份），而是只挑 Scheme
语法实际会用到的那几个 token class（`literal`/`number`/`string`/
`symbol`/`built_in`/`comment`/`name`），颜色数值直接从装好的
`node_modules/highlight.js/styles/github-dark.css` 里抄真实值，背景/基础
文字色则复用自己的 stone token（跟其余深色 UI 保持一致，不是另起一套配色）。

PWA 用 `vite-plugin-pwa`，`registerType: 'prompt'`（不是默认的
`autoUpdate`）——简报 pitfall #5 明确要求新部署不能在用户阅读/答题进行到
一半时把页面强制刷新掉，`AppShell` 里只在用户回到年历页（空闲态）时才真正
应用等待中的更新。这台环境没有任何图像处理工具，`web/scripts/
generate-icons.js` 用 Node 内置 `zlib`（deflate）加一段手写的 CRC32
实现，从零字节编码出合法的 PNG（stone-900 纯色方块）——用 `file` 命令
确认过是真实可解析的 PNG，还在浏览器里直接打开验证过能正常解码显示，
不是随手拼了几个字节赌它能用。安装提示卡区分平台：Chrome/Android 监听
`beforeinstallprompt` 给一个真正触发安装弹窗的按钮；iOS Safari 不支持
这个事件，改成静态的"点分享→添加到主屏幕"文字说明；两种都只显示一次
（`localStorage` 记已展示/已关闭状态），已经是 standalone 模式运行时
完全不显示。

**部署这一步踩了一个坑，两次提交才修对**：`web/` 里 `core/
schemaValidators.ts` 需要 `ajv`/`ajv-formats`，但这两个包只在仓库**根**
`package.json` 里声明（`core/` 不是独立 npm 包）。第一次以为"给
`web/package.json` 也加一份 `ajv`"就够了，本地 `npm run build` 也确实
通过——但这只是误打误撞的绿：本机根目录 `node_modules` 早在这次 session
前面跑 CLI 时就装过，Node 从 `core/schemaValidators.ts` 往上找依赖时，
第一个摸到的就是根 `node_modules`，`web/` 自己新装的那份根本没被用到过。
真正推上 GitHub Actions 后照样报 "Cannot find module 'ajv'"——因为 CI
只在 `web/` 目录跑 `npm ci`，根目录的 `node_modules` 压根不存在。第二次
改成 GitHub Actions 工作流先在仓库根跑一次 `npm ci`、再进 `web/` 跑一次，
这次先把本机两个 `node_modules` 都物理删掉、完全重装一遍再验证，不是
又一次"能跑就推"。教训：`web/` 依赖 `core/`，但两者不在同一个 npm 项目
边界内，这条隐性耦合以后加新代码引入新依赖时还要留意——任何被 `core/`
用到、但只在根 `package.json` 声明的包，都需要 CI 里根目录也 `npm ci`
过，不能假设 `web/` 自己的 `npm ci` 就够了。

### 收尾

`MILESTONES.md` 新增"阶段二 M5"小节，W0-W4 打勾（每一步都是用户实机确认后
才推进的，不是自我判断），W5（真机打磨）明确不打勾、留作下一步——按简报
自己的节奏，故意等用户真机用一段时间、带着具体反馈回来再做针对性调整，
不是不知道要做什么。三个已知遗留问题（SICP 反引号 bug、生产 bundle 体积
~230KB gzip 还没做代码分割、网页版 IndexedDB 与 CLI `.kuibu-events.jsonl`
完全独立且 v0.1 没有导入导出）记进了 `MILESTONES.md` 的"已知遗留问题"和
"阶段二 M6+ 待排期"，SICP 那条另存了一条独立 memory 方便跨 session 追踪。
版本号：网页版还是 v0.1 阶段（阶段二"基本可用"才升到 2.0.0，由用户判断
时机），这次改动没有触碰 `package.json` 的 `version` 字段——阶段一 CLI
的版本号规则跟阶段二网页版是两件独立的事，见 `CLAUDE.md`「版本号规则」。

## 2026-08-06 —— 补上网页版漏做的前情回顾（W2 遗留 gap）

会话开头先做了一遍全仓库梳理（架构/开发史/规范），顺带用只读的 `kuibu status`
查了一眼真实打卡记录（确认过这条命令不写文件，安全），发现一个此前 memory
里记错的事实：**真实的 21 天打卡其实已经断签**——`.kuibu-events.jsonl` 里
只有 2026-08-01 一条真实 checkin，之后几天精力全投在 Gatsby/西游记/网页版
上，`status` 显示"当前连续 0 天"。已更新相关 memory，也当面跟用户提了一句，
但用户当时选择先继续网页版的手头问题。

用户报告"网页版 Today 页面只有当天内容，没有 recap"，先诊断是"没生成"还是
"没显示"：`packs/public/sicp/recap_checkpoints.json` 确实存在（35 条），
`web/src/lib/loadPack.ts` 也确实把它读进了 `pack.recap_checkpoints`——问题
出在 `web/src/pages/TodayPage.tsx` 从头到尾没读过这个字段。对比
`cli/index.ts:174-200`：CLI 在打印正文前会调用
`findApplicableRecapCheckpoint` 查表，命中就先打印目录+回顾文字再进正文；
这段逻辑在 2026-08-05 的 W2（阅读视图）里漏搬了——`MILESTONES.md` 当时对
W2 的描述也确实只提了正文渲染，不是刻意排除的范围，是真漏了。

修复：新增 `RecapToc` JSX 组件（照抄 `cli/renderTableOfContents.ts` 的
语义，缩进+箭头标注当前位置），在 `TodayPage.tsx` 渲染正文前用
`reducedState.readBlockIds.size`（跟 CLI 用同一个"session 开始前累计读过
多少 block"的口径）查 `findApplicableRecapCheckpoint`，命中就渲染一张
recap 卡片。网页版是连续滚动页面，不需要 CLI 那种"press Enter 继续"的
显式步骤——回顾阅读时间天然落在同一个阅读计时器窗口里，不用像 CLI 那样
单独计时再加进反馈。

live-browser 验证：往 IndexedDB 手动塞 4 条假 `block_read` 事件触发第一个
checkpoint（阈值 4），确认 recap 卡片 + 目录正确渲染，且流程能正常继续
进入答题——光看 build 通过证明不了这种"特定进度触发"的场景真的渲染对了。
这次 session 里 `mcp__claude-in-chrome` 的截图工具又出现多次空白截图
（尽管 DOM/computed style 查询证明内容确实在视口内），继续用
`javascript_tool` 的 DOM/滚动位置检查当可靠验证手段，跟 W2 当时记的
经验一致。顺手发现并清理了一个 `web/dev-dist/`（`vite-plugin-pwa` 开发
模式产物，未被 gitignore），补进 `web/.gitignore`。

## 2026-08-06 —— 阶段二 M5.5：内容包导入 + 多书书架（回应"能否上传 epub 阅读"）

用户问"现在有没有办法让用户上传 epub 并实现阅读"。运行时解析 epub 在
`CLAUDE.md` 的否决表里明确否决过（LLM 切分/出题是构建期操作，阅读器绝不
联网/调 LLM），所以没有直接实现，而是解释了这条边界，并指出已经存在的
另一条路：`packs/private/` 私有书流水线（已经用过三次：Gatsby/西游记/
乔布斯传）。用 `AskUserQuestion` 确认用户想要哪种，用户选了"网页版加一个
导入内容包的入口"——对应 `docs/MILESTONES.md` M6+ 待排期里"网页版导入
内容包"那一项，这次提前做。

进 Plan 模式，两个 Explore agent 并行摸底（`web/` 里 `BOOK_ID` 硬编码的
全部触点；`cli/loadPack.ts`/`discoverPacks.ts`/`schemaValidators.ts` 的
可复用性、web brief 里跟这个功能相关的 pitfall #10/#12）。摸底发现底层
其实早就是多书就绪的：`loadPack(bookId)`/`getAllEvents(bookId)` 全部已经
参数化，`eventsDb.ts` 已经一书一个 IndexedDB，`sync-packs.js` 甚至已经在
生成 `index.json` 却从没人读过。真正写死的只有 `config.ts` 一行常量 +
两个调用点 + Shelf 页的空壳。

Plan agent 设计阶段揪出一个之前没意识到的真实隐患：`schema/pack.schema.json`
完全不校验交叉引用——`question_ids` 不保证指向真实存在的题，`answer_index`
也没跟 `options.length` 挂钩。实测验证：越界的 `answer_index` 会让
`shuffleOptions` 静默返回 `answerIndex: -1`，题目变成"选什么都错"，不崩溃
不报错，光跑一遍看不出来；手写内容 + 导入未经审查的包都可能撞上。写了
`core/checkPackReferences.ts` 之前，先跑了个脚本核对 sicp/gatsby/xiyouji
三本现有真实内容包，确认全部干净，接入 `cli/loadPack.ts` 不会误伤现有书。

用 `AskUserQuestion` 定了三个关键决策（不是我自己拍板的）：上传格式选
"单个打包好的 .kuibu.json"（不是 7 文件多选、不是 zip）；Shelf 范围选
"真正的选书器"（不是"导入即替换唯一一本书"）；这轮不做事件日志导出/导入。
另外内置书要不要把 Gatsby/西游记也一起铺开问了一轮，用户选"三本全上"；
写 plan 过程中发现西游记铺开到网页版意味着**公开发布**它那个已知未修的
"逐字引用其实是意译"问题，专门停下来又确认了一次，用户明确选择"继续上架"。
book_id 撞车策略问了一轮，选"导入的赢，先弹框确认"。

实现按 8 个步骤顺序推进，每步验证后单独 commit（用户此前定过的自主执行
规则：步骤之间不用逐次确认，只在真正需要决策的地方停）：

0. `.gitignore` + `.githooks/pre-commit` 先堵住 `bundles/`/`*.kuibu.json`
   泄漏口——**规则先于脚本存在**，跟 `packs/private/` 当年的教训一样。
   实测验证过 hook 真的会拦，用的是公开书的占位文件，不是拿私有书产物试。
1. `scripts/bundle-pack.ts`：几乎全靠复用 `cli/discoverPacks.ts` +
   `cli/loadPack.ts`，输出前后都重新校验一遍；拒绝写进 `web/`（否则下次
   部署就发布出去了）；私有书源会打印版权警告。对 sicp/gatsby/xiyouji/
   sjobs 四本都跑通过。
2. `core/checkPackReferences.ts`：交叉引用/id 唯一性/`answer_index` 越界
   检查，接进 `cli/loadPack.ts`。
3. `web/src/lib/loadPack.ts` 拆出 `packFromCombined.ts`（校验+版本闸门+
   引用检查的共享尾段），fetch 路径和导入路径共用。
4. `web/src/lib/importedPacksDb.ts`：`kuibu:imported-packs` 两个 store
   （重的 pack、轻的 meta）单事务写入，避免书架每次挂载都要反序列化整包。
5. `BOOK_ID` 硬编码换成 `ActiveBookProvider`（context+localStorage，照抄
   `ThemeProvider` 的模式）——这是枢纽步骤，改完先在"还是只有 SICP"的
   状态下 live-browser 验证无回归，再往下走。`TodayPage` 切书时重置到
   `loading` 状态，否则异步空档里快速点"读完了"会把 `block_read` 写进
   错误的书。
6. `web/scripts/sync-packs.js` 的 `BOOK_IDS` 从 `["sicp"]` 扩到三本。
7. Shelf 页从"SICP only for now"空壳换成真正的选书器：内置+导入合并
   列表、点击切书、导入用 `<input type="file">`、删除导入的书**不删
   事件日志**（重新导入同一个 book_id 打卡记录能接上——项目唯一成功
   指标是连续打卡，不能让清存储这个动作连带清零打卡历史）。

live-browser 全流程验证，不只是 build 通过：用 `mcp__claude-in-chrome`
的 `file_upload` 工具（不是模拟）把真实 bundle 文件选进页面的文件输入框，
导入乔布斯传预览包、自动激活、完整走一遍读→答题→打卡，年历格子点亮；
删除后确认退回默认书；**重新导入同一个 book_id，确认之前那次打卡记录
还在**（不是只声称保留策略生效，是真的验证了）；喂了三种坏文件（JSON
损坏、`schema_version` 不兼容、题目引用悬空），确认各自有可读报错且
IndexedDB 里什么都没存进去；连续选中同一个文件两次确认 change 事件仍会
触发。**live-browser 测试中抓到一个 build/单测都看不出来的真实 bug**：
书架每一行原本是"整行一个 `<button>`，删除按钮又是嵌在里面的
`<button>`"——`<button>` 不能嵌套 `<button>`，Chrome 控制台报了个
hydration 形状的错误。改成外层 `<div>`、选中和删除变成两个平级按钮修好。

`README.md`/`docs/MILESTONES.md`（新增"阶段二 M5.5"，从 M6+ 待排期里挪走）/
`docs/DESIGN.md` §4.5 都同步更新。版本号：新增了用户可见的能力（书籍切换 +
内容包导入），按 `CLAUDE.md` 的规则算 MINOR，`package.json` 升到 0.6.0——
这是 Claude 自己按规则判断的时机，大版本号（何时到 2.0.0）仍然只由用户
判断。全部改动 push 到 `main`，触发了 GitHub Actions 部署，西游记从这次
起正式出现在公开线上地址。
