# kuibu 阶段一里程碑

一次只做一个。每个里程碑做完，我实际用一天，再开下一个。

---

## M0 — 契约先行

**目标**：schema 定死，两侧校验器能跑通。

- [x] `schema/pack.schema.json` —— manifest / block / item / question
- [x] `schema/events.schema.json` —— 事件日志各 event type
- [x] Python 侧 pydantic 模型（由 schema 生成或校验一致性）
- [x] TS 侧 ajv 校验器 + 生成的类型（当初设想用 zod，实际用了 ajv 直接吃 JSON Schema）
- [x] 一份手写的**极小样例内容包**（3 个 block、2 个知识点、2 道题），双侧校验通过

**验收**：手写样例包能同时通过 Python 和 TS 的校验。

> 为什么先做这个：schema 是两个语言、两个组件、两个阶段的唯一契约。它一旦漂移，后面全部返工。
> 手写样例包让后续里程碑不必等生成器就绪。

---

## M1 — 阅读器核心逻辑（`core/`，零 IO）

**目标**：纯函数层跑通，全部单元测试覆盖。

- [x] session 打包器：给定剩余 block 与当日时长目标 → 今日 block 列表
- [x] Leitner 调度器（策略接口 + 默认实现，5 档 box）
- [x] 事件日志 reducer：JSONL → 当前状态（阅读位置 / box 状态 / 打卡日集合 / 错题集）
- [x] 打卡日换算（偏移自然日，默认 offset=4）
- [x] 题目队列排序 + 选项 shuffle
- [x] 打卡判定（2026-08 修订为"读完+做完题"，不再要求时长达标，见 DESIGN.md §3.2）

**验收**：不碰任何文件、时钟、终端，全部逻辑有测试。

---

## M2 — CLI 闭环（用手写样例包）

**目标**：能用假内容完整走一遍每日流程。

- [x] 加载内容包 + 校验 schema_version
- [x] 事件日志读写（逐条 append + 落盘）
- [x] 阅读呈现 + 计时（2026-08 由逐 block 经 pager 改成一次性打印全部内容 +
  分摊计时，pager 整个去掉，见 `docs/DESIGN.md` §7.4 修订）
- [x] 答题交互（数字键选择）
- [x] 打卡热力图（2026-08 升级成全年 GitHub 风格日历，见 `core/yearCalendar.ts`）
- [x] 进度呈现（小节 + 整章百分比，另加 `status` 的详细当前位置/目录/预计完读天数）
- [x] 每日时长目标可调
- [x] 导入导出

**验收**：用 3 个 block 的样例包，能完成"读 → 答题 → 打卡 → 看热力图"，中途 Ctrl-C 后重启能续上且记录不丢。

> 到这里为止都不需要 LLM。刻意的——先把闭环跑通，再解决内容供给。

---

## M3 — 生成器（`pack-gen/`）

**目标**：SICP 第一章变成真实内容包。

- [x] `SourceAdapter` 接口 + `TexinfoHtmlAdapter`（SICP）
- [x] 机械切分：第一章 → 各小节
- [x] 每小节单次 LLM 调用 → 块边界索引 + est_seconds + recap + 知识点 + 选择题
  （目前是人工按同一份规格手写，还没接真正的 API，见 `pack-gen/generator/section_prompt.md`）
- [x] 脚本按边界索引切割原文（LLM 不复述原文）
- [x] 中间产物落盘，支持增量重跑与失败重试
- [x] 输出通过 schema 校验

**验收**：生成 SICP 1.1 的包，人工抽查 10 道题——干扰项是否为常见误解，代码片段是否与原文逐字一致。

---

## M4 — 上线自用

- [x] 生成 SICP 第一章完整包
- [x] `.gitignore` 与 pre-commit hook（防私有包误推）
- [x] README（自己三个月后还能看懂怎么用）
- [ ] 开始连续 21 天打卡 —— **进行中**，还没到 21 天，不要提前打勾

**验收**：成功指标本身。

> **版本号提醒**：M0-M4 的代码/内容部分做完 ≠ 自动升到 `1.0.0`。大版本号什么时候
> 从 `0.y.z` 升到 `1.0.0`（对应"CLI 基本可用"）由 Qian 自己判断和宣布，
> 完整规则见 `CLAUDE.md`「版本号规则」。

---

## 阶段二 M1 —— EpubAdapter 跑通链路（The Great Gatsby 前几章）

**目标**：验证"epub → 解析 → 切块 → 出题/recap → CLI 阅读打卡"整条链路，且新书的打卡
记录跟 SICP（阶段一验收指标所在的那份日志）完全隔离。跟 M0–M4 不同，这条milestone跟
"连续打卡 21 天"并行推进，不等它完成——这是用户明确拍板的决定，不是我自己提前的。
详细设计见 `docs/DESIGN.md` §14。

- [x] `EpubAdapter`（`pack-gen/generator/epub_adapter.py`）：按 spine 顺序解析 epub，
  识别 `<div id="chapter-N">` 章节块，跳过 Gutenberg 页眉/页脚样板
- [x] `pack-gen/sources/gatsby/`：存入 Project Gutenberg 官方 epub（ebook #64317，公有领域）
- [x] The Great Gatsby 第一章：手工切块 + 知识点 + 复习题 + recap checkpoint
  （无 exercise，`exercises: []`）——14 blocks / 11 items / 11 questions / 3 recap checkpoints
- [x] 多本书事件日志隔离：`--log` 默认值按 `--pack` 目录名推导（SICP 默认路径不变）；
  加载时校验日志已有 `book_id` 与当前 pack 是否匹配，不匹配拒绝运行
- [x] `.gitignore` 从精确匹配 `.kuibu-events.jsonl` 改成通配，覆盖新书的默认日志文件
- [x] `packs/public/gatsby/` 组装，两侧 schema 校验通过
- [x] `kuibu today --pack packs/public/gatsby` 完整走一遍：阅读 → 答题 → 打卡 → 年历
- [x] 确认 SICP 默认路径（不传 `--pack`）的行为、输出、事件日志完全不受影响

**验收**：Gatsby 第一章能独立走完一次完整 session，SICP 现有体验/日志零变化。**M1 完成
（2026-08-02）**——目前只做了第一章（14 个 block），不是全书；铺开全书排在 M2。

## 阶段二 M2 —— Gatsby 铺开到全书

**目标**：把 M1 只做了第一章的 Gatsby 内容包铺开到全书 9 章。

- [x] Chapters II–IX：8 个并行 subagent 各写一章，跟第一章同一套流程/质量标准
  （block 切分respects场景分隔、知识点覆盖大部分 block、干扰项是"半对半错"级别的
  常见误判、explanation 逐字引用原文）
- [x] `build_all_gatsby_sections.py`（镜像 `build_all_sections.py`）合并全部 9 章，
  单一递增 `IdCounters`——验证过关键不变量：Chapter I 的 id（b0001-b0014 等）
  没有因为重新合并全书而改变，用户真实的 `.kuibu-events-gatsby.jsonl` 不受影响
- [x] `packs/public/gatsby/` 更新为全书：118 blocks / 125 items / 125 questions /
  0 exercises，两侧 schema 校验通过
- [x] `recap_checkpoints.json` 从 3 条扩到 22 条，覆盖全书——重新计算后发现前 3 条
  的边界其实也变了（`packSession` 不认章节边界，纯按时长贪心打包），22 条全部
  重写，不是简单在后面追加
- [x] 用真实用户日志的一次性副本验证续读：从 block 5 正确接着读（不是从头开始，
  也没有跳过任何内容），recap 正确定位到对应的 checkpoint

**验收**：`kuibu today --pack gatsby` 现在覆盖全书 9 章约 4 小时阅读量，用户已有的
真实打卡记录/block id 完全不受影响。

## 阶段二 M3 —— 中文小说《西游记》（进行中，等用户验收）

**目标**：验证多本书链路能处理"跟 Gatsby 结构完全不同的 epub 来源" + "内容是中文"
这两件新事——用户拍板书目是吴承恩《西游记》（明代小说，公有领域），要求先做 10 回
给用户验收再铺开剩余部分。**这条 milestone 目前处于验收等待状态，不要因为下面
清单打了勾就误以为已经批准/完成。**

- [x] `GutenbergTxtAdapter`（`pack-gen/generator/gutenberg_txt_adapter.py`）：西游记的
  Gutenberg 转录版没有 `<div id="chapter-N">` 包装，正文是一串平铺的 `<p>`，章节靠
  正文自己的"第…回"标题行识别；样板起止标记是裸 `<span>`，不在任何 `<p>` 里，靠
  字符串层面裁剪定位。原文章节数字写法本身不统一（标准数字/逐位读数/"○"代替十位
  的零都出现过），不解析数字本身，只按遇到标题的顺序自己编号
- [x] 从 `epub_adapter.py` 抽出 `epub_zip.py`（zip+OPF+spine 解析）和 `html_text.py`
  （`<br/>` 保留换行的内联渲染），两个 adapter 共用——第二个 adapter 出现后这不再是
  投机式抽象，是真实重复
- [x] `pack-gen/sources/xiyouji/`：存入 Project Gutenberg 官方 epub（ebook #23962，
  公有领域，吴承恩约 1582 年去世），实测验证找到全部 100 回
- [x] 第一回：手工切块 + 知识点 + 复习题 + recap checkpoint（无 exercise），内容全部
  用中文（跟随原书语言，CLI/界面依旧英文）
- [x] 第二至十回：8 个并行 subagent 各写一回，跟第一回同一套流程/质量标准，并被
  要求对着机械切分产物核实情节细节，不能只凭对故事的一般记忆
- [x] `packs/public/xiyouji/` 组装（前 10 回）：121 blocks / 120 items / 120
  questions / 0 exercises / 26 recap checkpoints，两侧 schema 校验通过
- [x] `kuibu today --pack xiyouji` 完整走一遍，繁体字终端渲染正常，不需要转简体
- [x] book_id 定为 `xiyouji`，命令行短用 `--pack xiyouji` 即可

**已知问题（未修）**：QA 时抽查发现 explanation 里号称"逐字引用原文"的短句，
约有一半其实是意译后加引号，不是原文的精确子串——把作者自己写的中文字段统一
转成繁体（跟原文同一套字体）修好了简繁夹杂，但没有修"是不是真的逐字引用"这个
更深的问题，需要逐条核对原文才能修，还没做。

**验收**：西游记前 10 回能独立走完一次完整 session，用户看过内容后决定是否
继续铺开剩余 90 回（或要求先修上面那条已知问题）。**不打勾**，等用户验收结论。

## 阶段二 M4 —— 用户私有 epub（《史蒂夫·乔布斯传》，进行中，等用户验收）

**目标**：验证 `packs/private/` 这条路径本身能走通——私有书的源文件、构建期中间
产物、最终内容包全程不进 git，同时复用公开书的整条 pack-gen 流水线。跟西游记
M3 一样，先做一小批预览（前言 + 前两章）给用户验收，通过再铺开剩余章节。

- [x] 私有书隔离基础设施：`pack-gen/sources/private/`、`pack-gen/build/private/`
  两个 wholesale gitignore 根（不用像公开书那样每本手动列 gitignore 行）；
  `.githooks/pre-commit` 同步扩展拦截这两个新路径；顺手修了一个实测发现的真实
  漏洞——git 默认给非 ASCII 文件名加双引号转义，导致 hook 的锚定正则漏检
  （`乔布斯传.epub` 这种中文文件名就撞上了）
- [x] `PerFileEpubAdapter`（`pack-gen/generator/per_file_epub_adapter.py`）：这本书
  是第三种 epub 结构——每个 spine 文件是独立一节，靠单一标题标签 + 平铺 `<p>`，
  复用共享的 `epub_zip.py`/`html_text.py`。测试中发现源文件 `<spine>` 本身有一处
  真实的章节顺序错误（第二十六章排在第二十五章前面），在 `split_sjobs.py` 里按
  解析出的真实章节号重排修正，不在 adapter 里做
- [x] 前言 + 第一、二章预览批次：36 blocks / 36 knowledge items / 36 questions /
  9 recap checkpoints，`explanation` 全部核对过是原文逐字子串（西游记 M3 的
  known limitation 这次没有重犯）
- [x] 两侧 schema 校验通过，`kuibu today --pack sjobs` 完整走一遍
- [x] 用户验收后反馈两个真实 bug 并已修复：前言被错误地打上"Chapter 1"标签
  （`section_path` 顺序编号导致前言和第一章撞号，改成非数字的
  `"foreword"`/`"afterword"` + 真实章节号）；中英文混排时英文词组会被从中间
  强制换行（`wordWrap` 按 `.length` 而非终端显示列数判断宽度，中日韩宽字符
  计算错误——复用 `textWidth.ts` 修好）

**验收**：预览批次通过验收后决定是否铺开剩余 39 节；**不打勾**，等用户验收结论
（同西游记 M3 的先例）。

## 阶段二 M5+ —— 待排期

- 西游记铺开到全书（如果 M3 验收通过）
- 乔布斯传铺开到全书（如果 M4 验收通过）
- 复习健康度提示 · 周期性综合测验 · 网页版导入内容包 · 补签 · 日志快照压缩
