# kuibu（跬步）

> 名出「不积跬步，无以至千里」。CLI 命令名同为 `kuibu`。

一个个人用的读书打卡工具。项目由我负责构思设计，Claude Code 负责技术实现。
唯一目标：连续打卡 21 天不断签。详细设计见 `docs/DESIGN.md`，里程碑见
`docs/MILESTONES.md`。

---

## 使用篇

这一部分假设你没有装过 Git、也没用过 npm，从零开始一步步走到能跑起来。

### 第一步：装好两样东西

**Git**（用来获取代码）和 **Node.js**（跑这个项目需要，自带 npm，不用单独装）。

先检查是不是已经装过：打开一个终端（Windows 用 PowerShell 或 Git Bash，
macOS/Linux 用 Terminal），依次输入：

```
git --version
node --version
npm --version
```

三条都能打印出版本号（不管具体是什么数字）就说明已经装好了，跳到下一步。
如果提示"找不到命令"：

- **Git**：Windows 去 <https://git-scm.com/downloads> 下载安装包；macOS 用
  `xcode-select --install`；Linux 用发行版自带的包管理器（如
  `sudo apt install git`）。
- **Node.js**：去 <https://nodejs.org> 下载 LTS（长期支持）版安装包，一路
  下一步即可；Windows 也可以用 `winget install OpenJS.NodeJS.LTS`，macOS
  用 `brew install node`。装好后重新打开一个终端窗口，上面三条命令再跑
  一遍确认。

### 第二步：把代码拉到本地

```
git clone https://github.com/houkensjtu/kuibu.git
cd kuibu
```

第一行把代码仓库复制一份到当前目录下的 `kuibu` 文件夹；第二行进入这个文件夹
——之后所有命令都要在这个目录里跑。

再跑一条一次性设置：

```
git config core.hooksPath .githooks
```

这条不会随 `git clone` 自动生效（`core.hooksPath` 是本地配置，不会被记进
仓库历史），但拦截私有内容包误推的 pre-commit 检查依赖它，务必先跑一遍。

### 第三步：安装项目依赖

```
npm install
```

这条命令会读 `package.json` 里列出的依赖列表，把项目需要用到的第三方代码包
下载到本地的 `node_modules/` 文件夹里（这个文件夹很大、不进 git，属于正常
现象）。只需要跑一次；以后如果 `pull` 到别人新增了依赖的改动，重新跑一次
这条命令补齐就行。

### 第四步：跑起来

```
npm run dev -- today     # 今天的阅读 + 答题 + 打卡
npm run dev -- status    # 只看当前状态，不开始新 session
```

`npm run dev` 是 `package.json` 里定义的一个脚本，作用是直接运行 TypeScript
源码（通过一个叫 `tsx` 的工具），不需要额外编译这一步。`--` 后面跟的是要
传给 kuibu 本身的参数（`today`/`status`），`--` 本身是约定俗成的分隔符，
告诉 npm "后面这些是脚本的参数，不是 npm 自己的参数"。

两个命令都默认读 `packs/public/sicp`（真实 SICP 第一章内容包）、默认事件
日志在仓库根目录的 `.kuibu-events.jsonl`（这个文件不进 git，每个人的打卡
记录是自己的）。

如果想要一个真正的 `kuibu` 命令（不用每次打 `npm run dev --`），编译一次
再全局链接：

```
npm run build
npm link
kuibu today
kuibu status
```

`npm run build` 把 TypeScript 编译成普通 JS，放进 `dist/` 目录；`npm link`
在系统里建一个全局软链接，指向这份编译产物，让你在任何目录下直接打
`kuibu` 都能调用到它。`npm link` 只需做一次；以后代码有变动，重新
`npm run build` 就行，不用再 `npm link`。

### 命令一览

| 命令 | 作用 |
|---|---|
| `today` | 开始/继续今天的阅读+答题+打卡；`--minutes <n>` 临时调整今日目标（会记住） |
| `status` | 查看当前连续打卡天数、今天是否已打卡、阅读进度、待复习题数——不会进入阅读或答题流程 |
| `books` | 列出 `packs/public/`（+ `packs/private/`，如果有）下所有能识别的书，每本一行打卡摘要 |
| `export` | 把事件日志导出到 stdout，配合 shell 重定向存成文件备份 |
| `import <file>` | 合并一份之前导出的日志（按 id 去重），用于跨设备同步或恢复备份 |

`today`/`status` 都接受 `--pack <dir-or-book-id>`——可以是完整目录路径
（`packs/public/gatsby`），也可以是短书名（`gatsby`，`kuibu books` 列出的
就是这个名字），默认 `packs/public/sicp`。`--log <path>` 默认按 `--pack`
自动推导（SICP 继续用 `.kuibu-events.jsonl`，其他书用
`.kuibu-events-<书名>.jsonl`），每本书的打卡记录互相独立；一般不需要手动
传 `--log`，除非你想把某本书的记录存到别的位置。

```
kuibu today --pack gatsby      # 不用打完整路径，也不用再传 --log
kuibu status --pack gatsby
kuibu books                    # 一眼看到所有书的打卡状态
```

### 试用完了想清空重来

打卡记录就是 `.kuibu-events.jsonl` 这一个文件，删掉或改名即可清零：

```
rm .kuibu-events.jsonl
```

想一边试用一边不影响真实记录，给 `--log` 指定一个别的路径就行，比如
`npm run dev -- today --log /tmp/kuibu-test.jsonl`——这样跑多少次都不会碰到
真正的打卡记录。

### 内容从哪来

`packs/public/sicp/` 是 SICP 第一章的完整内容包（137 个 block、70 个知识点、
73 道复习题、46 道原书 Exercise、35 条前情回顾，覆盖 1.1/1.2/1.3 全部小节 +
章节引言）。复习题（每天必做，自动判分）和原书 Exercise（可选做，不判分，
只给 hint 不给答案）是两种不同的东西，见 `docs/DESIGN.md` §3.3/§3.3.1；前情
回顾在阅读之前展示累计读过的内容，阅读器只查表、不调用任何 API，见
`docs/DESIGN.md` §3.1.1。生成流程见 `pack-gen/generator/section_prompt.md`：
目前这一步还没接真正的 LLM API，是由人工（Claude）按同一份规格手写每小节
的输出，将来接入 API 时会原样复用这份 schema。

---

## 开发篇

```
npm run typecheck   # tsc --noEmit
npm test            # vitest
```

`pack-gen/`（内容生成器）是独立的 Python 项目，测试单独跑：

```
cd pack-gen
.venv/Scripts/python.exe -m pytest    # Windows；其他平台是 .venv/bin/python
```

### 项目结构

```
core/         纯逻辑，零 IO（打卡日换算、Leitner 调度、事件日志 reducer……）
cli/          core + 文件 IO + 终端交互
pack-gen/     构建期工具，产出内容包（目前手工代替 LLM，见上）
schema/       JSON Schema 契约，Python/TS 两侧的类型都从这里生成
packs/public/ 公开内容包，进 git；packs-private/ 是私有内容包，不进 git
```

架构上的硬性约束见 `CLAUDE.md`（如"阅读器绝不联网/调用 LLM"）。
