# kuibu（跬步）

> 名出「不积跬步，无以至千里」。CLI 命令名同为 `kuibu`。

一个个人用的读书打卡工具。阶段一是 CLI，阶段二搬到 GitHub Pages 静态站，阶段三才考虑产品化。

完整设计见 `docs/DESIGN.md`，决策依据见 `docs/adr/`。**动手前先读 DESIGN.md。**

---

## 唯一成功指标

**连续打卡 21 天不断签。**

优先级排序的依据永远是这个指标。凡是可能让单次 session 超时或失败的设计，都是对它的直接威胁。
遇到"做得更完善"和"今天能跑起来"的冲突，选后者。

---

## 架构铁律（不可协商）

1. **`core/` 是纯函数库，零 IO。** 不做文件读写、不发网络请求、不打印终端、不读时钟。
   时间、随机数、存储一律由调用方注入。这是 CLI 与网页版共用逻辑的唯一前提。

2. **阅读器绝不调用 LLM，绝不联网。** 所有 LLM 产物必须在构建期落盘进内容包。
   推论：题目必须可离线自动判分 → 只用选择题。

3. **生成器与阅读器彻底解耦**，唯一接口是内容包 schema。
   阅读器不得 import 生成器的任何代码，不得依赖其内部结构。

4. **内容包 schema 由 `schema/` 下的 JSON Schema 单一定义。**
   Python 侧用 pydantic 生成，TS 侧用 zod/ajv 生成。禁止在任一侧手写重复的类型定义。

5. **用户状态是 append-only 事件日志（JSONL），不是可覆盖的状态快照。**
   每个动作追加一行并立即落盘。当前状态由 reducer 折叠日志得出，不单独持久化。

6. **生成器的 LLM 绝不复述原文。** 只输出块的边界索引与元数据，原文由脚本按边界切割。
   （防止 SICP 的 Scheme 代码被悄悄改写。）

---

## 明确否决过的方案 —— 不要重新提出

| 否决项 | 理由 |
|---|---|
| 运行时解析 epub | LLM 切分/出题是构建期操作；解析后仍需另存知识点，纯增复杂度 |
| SQLite 存内容包 | 数据量级用内存过滤即可；二进制不可 diff，浏览器还要 wasm |
| 状态快照文件 | 崩溃会丢数据；多端合并产生"哪边赢"冲突 |
| 简答题 / 需要用户输入文本的题型 | 判分需要 LLM，违反铁律 2 |
| 交互式 TUI | 成本高，且阶段二网页版一行都用不上 |
| 断签清零 / 惩罚机制 | 产品定位是 Anki + 阅读日历，不是 Duolingo |
| 分三次 LLM 调用（切分→知识点→出题） | 保持单次调用，但粒度是**一个小节**而非整本书 |
| 本地时区自然日算 streak | 23:50 + 次日 00:10 会被误算成连续两天 |

---

## 分包边界

```
pack-gen/     Python      构建期工具，调 LLM，产出内容包
core/         TypeScript  纯逻辑，零 IO
cli/          TypeScript  core + 文件 IO + 终端交互
web/          TypeScript  core + IndexedDB + DOM（阶段二，暂不实现）
schema/       JSON Schema 契约单一真相源
packs/public/             公开内容包，进 git
```

`packs-private/` 在 `.gitignore` 里。**永远不要用 `git add -A`。**
注意 `.gitignore` 对已 tracked 文件无效——私有内容包必须在第一次 commit 前就被忽略。

---

## 关键行为规格（容易写错的地方）

- **打卡日** = 以本地时间凌晨 4:00 为界的偏移自然日。`checkin` 事件必须存已换算的 `date` 字段，不能只存 `ts`。
- **选择题的选项必须在运行时随机打乱**，存储用 `answer_index`。否则重复几次后记住的是"答案在 B 位"。
- **每日题目顺序**：新内容理解题（固定 2 道）→ 错题 → 其余到期项。超时间预算则停止。
- **超预算未做的到期项视同"未到期"**，明天继续排队。**绝不能视同答对**——那会产生虚假掌握。
- **当日读过的知识点全部入队**，被抽中出题的按答题结果进 box 0/1，未出题的从 box 2 起步。
- **阅读计时锚点**（2026-08 修订）= 今天全部 block 一次性打印 → 用户按 Enter
  表示读完，量一个总时长，再按各 block 的 `est_seconds` 占比分摊回每个
  block——不再是逐 block 进出 pager 计时（pager 已经整个去掉，见
  `docs/DESIGN.md` §7.4 的修订说明）。
- **正文标题是增量式的，跟真书排版一致**（2026-08 修订，取代早期"每个 block
  都打印 `Chapter 1 › 1.1 › 1.1.3` 完整路径"的方案——用户反馈"和真书很不一样"）：
  只在章/节/小节号相对上一个 block 变化的那一级开始，才打印从那一级往下的
  标题；同一小节里连续的 block 之间不重复标题。章一级带 `Chapter N` 前缀，
  其余层级只写编号本身，靠缩进表达层级（不是重复的 `Chapter 1 › ...` 前缀）。
  如果今天的阅读接着某天断在小节中间的位置继续，第一个 block 的标题下面补一行
  `...` 提示"这里之前还有内容"。正文每一行也统一缩进（比这个 block 的小节
  标题再深一级，`cli/renderBlocks.ts` 的 `indentContent`），只加恒定前缀，
  代码块内部的相对对齐不受影响。实现见 `cli/renderBlocks.ts`、`docs/DESIGN.md` §7.4。
- **进度呈现** = 小节 + 整章百分比同时显示。
- **前情回顾**（2026-08 新增）= 阅读器只查表，绝不现场调用任何 LLM/API——回顾
  文本构建期一次性写好，按用户**累计读过的 block 数**定位，不按"第几天"（每日
  时长假设只用来决定回顾切多细，不影响运行时查找的正确性，见
  `docs/DESIGN.md` §3.1.1、`core/recapCheckpoints.ts`）。第一天没有回顾，直接跳过。
  回顾环节的头部还会打印一份跟 `status` 一样的目录（`→ ... you are here today`），
  让用户先看到自己在全书里的位置，再读回顾文字。

---

## 踩过的坑 —— 已经修过一次，不要再犯

- **`readline.Interface.question()` 在同一个 Interface 上连续调用两次，第二次会误判 stdin 已结束**，导致进程在用户还没输入任何东西时直接退出。`tsx` 和编译后的纯 node 下都会复现，不是 `tsx` 专属问题；`for await (const line of rl)` 提前 `return` 也有类似的"再调用就死"问题。**结论：终端交互一律不用 `readline`**，走手写的 `cli/lineReader.ts`（自己缓冲 stdin、按换行符切分）。
- **Windows 下 Python 默认 stdout 编码是 cp1252**，打印中文会 `UnicodeEncodeError`。`pack-gen/` 下的脚本文件头一律 `sys.stdout.reconfigure(encoding="utf-8")`；`datamodel-code-generator` 同理必须带 `--encoding utf-8`。
- **pydantic v2 配合 `from __future__ import annotations` 时，字段名不能和它引用的类型名相同**（如字段 `date: date` 会冲突）。改字段名解决不了——schema 定死了字段名——用 `from datetime import date as _date` 起别名绕开。
- **`ajv`/`ajv-formats` 在 `moduleResolution: nodenext` 下默认导入的类型推断不对**：`Ajv` 要用具名导入，`ajv-formats` 的默认导出要显式 cast；`ajv.compile()` 不给显式类型参数（`ajv.compile<T>(...)`）会推出没用的类型。
- **`<blockquote>` 曾被 HTML 适配器整段丢弃**（没在允许的顶层标签列表里）；bs4 的 `Comment` 是 `NavigableString` 的子类，不显式排除会把 HTML 注释当正文渲染出来。两处都在 `texinfo_html_adapter.py`，改这个文件时留意。
- **章节引言文件（如 `Chapter-1.xhtml`）曾经整个没被解析**——只把编号小节文件喂给了适配器，导致引语/导论这类章节开篇内容整体缺失。加新章节时不能假设"编号小节文件"就是全部输入，引言文件要单独发现并走 `_parse_chapter_intro` 分支。
- **构建产物的缓存可能比源头"新"却内容更旧**：`merged-pack-parts.json` 曾经留着一处早就在别的文件里修好的编码问题（因为它是上一次构建生成的，之后没跟着重新合并）。内容包里出现乱码或过期内容，先重跑合并脚本（`build_all_sections.py`）再怀疑是不是新 bug。

---

## 版本号规则（SemVer，大版本号例外见下）

格式 `MAJOR.MINOR.PATCH`（如 `1.4.2`），管的是 `package.json` 的 `version` 字段——
`cli/index.ts` 的 `--version` 直接从 `package.json` 读，不要在两处手动维护同一个数字。

这跟内容包自己的 `schema_version`（`schema/pack.schema.json` 定义的契约形状版本，
兼容性判断在 `cli/loadPack.ts` 的 `SUPPORTED_SCHEMA_VERSION`）和
`generator_version`（记录哪版生成器产出了这份内容包）是两件不相关的事，改版本号
规则时不要混着改。

- **MAJOR —— 不是我（Claude）能决定的，只能用户来判断和宣布。** 对应产品阶段
  里程碑，不是常规 SemVer 的"破坏性变更"含义：`0.y.z` = 阶段一（CLI）还在
  开发中，尚未"基本可用"；升到 `1.0.0` 的时机由用户判断——哪怕某次改动看起来
  很大，也不能因此自己把大版本号升上去。之后同理：`2.0.0` 对应阶段二（网页版）
  基本可用，也是用户的决定。
- **MINOR**：新增了向后兼容的用户可见能力——新命令、新功能（比如 Exercise 那次）、
  内容覆盖范围的实质性扩展、schema 新增字段（不破坏旧内容包读取）。MINOR 前进时
  PATCH 归零。
- **PATCH**：bug 修复、内部重构（不改变用户可见行为）、纯文档改动、小的措辞/
  体验调整、依赖版本升级、内容纠错（不新增覆盖范围）。

**什么时候动这个号**：不要求每个 commit 都改；在一轮改动"完成到可以让用户试用"的
节点上，按上面的判断标准决定升 MINOR 还是 PATCH。写下这条规则之前的历史提交不
回溯改号——这条规则从生效那一刻起，只管以后的改动。

---

## 当前里程碑

见 `docs/MILESTONES.md`。一次只做一个里程碑，做完让我实际用一天再继续。

---

## 协作约定

- 我的主力语言是 Python 和 C++，**TypeScript 对我是新语言**。写 TS 时请顺带说明用到的惯用法和类型技巧，不要默认我懂。
- 我用 Emacs。生成的项目结构和脚本请对命令行友好。
- 改动涉及上面任何一条铁律或否决项时，先停下来问我，不要自行决定。
