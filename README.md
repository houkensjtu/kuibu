# kuibu（跬步）

> 名出「不积跬步，无以至千里」。CLI 命令名同为 `kuibu`。

一个个人用的读书打卡工具。项目由我负责构思设计，Claude Code 负责技术实现。
唯一目标：连续打卡 21 天不断签。详细设计见 `docs/DESIGN.md`，里程碑见
`docs/MILESTONES.md`。

## 版本

当前版本见 `package.json`（或跑 `npm run dev -- --version`）。版本号规则见
`CLAUDE.md`「版本号规则」——大版本号对应产品阶段（1.0 = CLI 基本可用，2.0 =
网页版基本可用），升级时机由我自己判断和宣布，不是 Claude 自主决定的。

## 克隆后先做一件事

```
git config core.hooksPath .githooks
```

这条不会随 clone 自动生效（`core.hooksPath` 是本地配置，不进 git 历史），
但拦截私有内容包误推的 pre-commit 检查依赖它，务必先跑一遍。

## 安装依赖

```
npm install
```

## 日常怎么用

开发模式不用编译，最省事，日常就用这个：

```
npm run dev -- today     # 今天的阅读 + 答题 + 打卡
npm run dev -- status    # 只看当前状态，不开始新 session
```

两个命令都默认读 `packs/public/sicp`（真实 SICP 第一章内容包）、
默认事件日志在仓库根目录的 `.kuibu-events.jsonl`（这个文件不进 git，
每个人的打卡记录是自己的）。

如果想要一个真正的 `kuibu` 命令（不用每次打 `npm run dev --`），编译一次
再全局链接：

```
npm run build
npm link
kuibu today
kuibu status
```

`npm link` 改的是全局 npm 状态，只需做一次；以后代码有变动，重新
`npm run build` 就行，不用再 `npm link`。

### 命令一览

| 命令 | 作用 |
|---|---|
| `today` | 开始/继续今天的阅读+答题+打卡；`--minutes <n>` 临时调整今日目标（会记住） |
| `status` | 查看当前连续打卡天数、今天是否已打卡、阅读进度、待复习题数——不会打开 pager 或进入答题 |
| `export` | 把事件日志导出到 stdout，配合 shell 重定向存成文件备份 |
| `import <file>` | 合并一份之前导出的日志（按 id 去重），用于跨设备同步或恢复备份 |

所有命令都接受 `--pack <dir>`（内容包目录，默认 `packs/public/sicp`）和
`--log <path>`（事件日志路径，默认 `.kuibu-events.jsonl`）。

### 试用完了想清空重来

打卡记录就是 `.kuibu-events.jsonl` 这一个文件，删掉或改名即可清零：

```
rm .kuibu-events.jsonl
```

想一边试用一边不影响真实记录，给 `--log` 指定一个别的路径就行，比如
`npm run dev -- today --log /tmp/kuibu-test.jsonl`——这样跑多少次都不会碰到
真正的打卡记录。

## 开发

```
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

`pack-gen/`（内容生成器）是独立的 Python 项目，测试单独跑：

```
cd pack-gen
.venv/Scripts/python.exe -m pytest    # Windows；其他平台是 .venv/bin/python
```

## 项目结构

```
core/         纯逻辑，零 IO（打卡日换算、Leitner 调度、事件日志 reducer……）
cli/          core + 文件 IO + pager + 终端交互
pack-gen/     构建期工具，产出内容包（目前手工代替 LLM，见下）
schema/       JSON Schema 契约，Python/TS 两侧的类型都从这里生成
packs/public/ 公开内容包，进 git；packs-private/ 是私有内容包，不进 git
```

架构上的硬性约束见 `CLAUDE.md`（如"阅读器绝不联网/调用 LLM"）。

## 内容从哪来

`packs/public/sicp/` 是 SICP 第一章的完整内容包（137 个 block、70 个知识点、
73 道复习题、46 道原书 Exercise，覆盖 1.1/1.2/1.3 全部小节 + 章节引言）。生成
流程见 `pack-gen/generator/section_prompt.md`：目前这一步还没接真正的 LLM
API，是由人工（Claude）按同一份规格手写每小节的输出，将来接入 API 时会原样
复用这份 schema。

复习题（每天必做，自动判分）和原书 Exercise（可选做，不判分，只给 hint 不给
答案）是两种不同的东西，见 `docs/DESIGN.md` §3.3/§3.3.1。
