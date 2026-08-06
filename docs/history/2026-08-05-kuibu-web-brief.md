# kuibu 阶段二网页版 —— 交给 Claude Code 的任务简报

> 直接粘贴给 Claude Code。建议同时说一句："动手前先读 `CLAUDE.md` 和 `docs/DESIGN.md`。"

---

## 背景

kuibu 阶段一（CLI）已完成并在日常使用中，版本 0.5.0。现在开始阶段二：一个部署在
GitHub Pages 上的静态网页版。**`CLAUDE.md` 里的六条架构铁律全部继续有效**，尤其是：

- `core/` 是零 IO 纯函数库 —— 网页版**原样 import**，一行不改。不要为了图方便在
  `core/` 里读 localStorage、调 `Date.now()` 或碰 IndexedDB。时间、随机数、存储
  一律由调用方注入。
- 阅读器绝不联网、绝不调 LLM。内容包是构建期落盘的静态 JSON。
- 用户状态是 append-only 事件日志，当前状态由 reducer 折叠得出，不存快照。

`cli/` 的渲染层**不复用**，网页版全部重写（原因见下面"坑 #1"）。

## 目标：网页版 v0.1

在手机浏览器（并可添加到主屏）上完成一次完整的每日流程：打开 → 看年历 → 进入今天
→ 阅读今日 block → 答题 → 打卡 → 年历更新。只做 SICP 一本书。

## 技术栈（已定，不要重新提案）

| 项 | 选择 |
|---|---|
| 构建 | Vite + React + TypeScript（`npm create vite@latest web -- --template react-ts`） |
| 组件库 | shadcn/ui，`npx shadcn@latest init` 时 base color 选 **`stone`**（先试，不顺手再议） |
| 样式 | Tailwind（随 shadcn 而来）+ `@tailwindcss/typography`，正文容器用 `prose prose-stone dark:prose-invert` |
| 图标 | `lucide-react` |
| 代码高亮 | `highlight.js`，只注册 scheme 一种语言；亮/暗两套主题 CSS 跟着 `.dark` class 切 |
| PWA | `vite-plugin-pwa` |
| 存储 | IndexedDB（事件日志一条一记录，`add()` 即 append） |

`web/` 与 `cli/`、`core/` 平级放在同一个仓库里，通过相对路径 import `core/`。vite 可能
需要 `server.fs.allow: ['..']`。

## UI 规格（经过 8 道决策门定下来的，不要自行改动）

**骨架**
- 常驻底部四 tab：**日历 · 今天 · 书架 · 设置**。shadcn 没有 tab bar 组件，自己搭
  （`fixed bottom-0` + flex 均分 + lucide 图标）。
- 首页 = 打卡年历。
- 底部栏**完全常驻**，阅读 session 进行中也在，不随滚动隐藏，不切换成阅读功能条。

**阅读视图**
- 今天的全部 block **一次性展开**成一长页，不分页、不逐块展开。
- 章节标题用增量式（只在章/节/小节号相对上一个 block 变化的那一级才出现），用
  `<h2>/<h3>` 的字号字重表达层级，**不用缩进**，**不做顶部 sticky**。
- 代码块用真正的 `<pre><code>` + highlight.js。
- 页面末尾一个整宽实心"读完了"按钮 —— 它是计时锚点，也是全屏唯一主行动。
- 计时：量一个总时长，按各 block 的 `est_seconds` 占比分摊回每个 block（沿用 CLI 模型）。

**答题**
- 一次一题，一张卡片占满内容区，答完自动推进下一题。
- 选项运行时 shuffle。
- 交互链：点选项 → 选中态高亮（未提交）→ 点"确认" → 判分 → 答错显示正确答案和解析 → 推进。
  **不要点选项即判分。** "确认"按钮在未选中时禁用。

**收尾**
- 答完题直接进打卡结果 + 年历，不插小结页。
- 年历上今日格点亮 + 连续天数 +1 给一个约 200ms 的过渡 —— 这是整个流程唯一的成就时刻。

**视觉**
- 暗色三态：跟随系统 / 强制浅色 / 强制深色，选择存本地，通过 `<html class="dark">` 切换，
  并监听 `matchMedia("(prefers-color-scheme: dark)")` 的变化。
- 字体全部用系统字体栈，不引入任何 web font：
  `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
- 移动优先：先按 375px 宽设计，桌面是加宽版。正文列限宽约 65ch 居中。
- 触控目标 ≥44×44pt。过渡动效 150–250ms ease-out，尊重 `prefers-reduced-motion`。
- 不能出现任何浏览器默认控件外观（蓝色下划线链接、灰色方块 button、原生 select）。

**PWA**
- manifest + `display: standalone` + 图标。
- Service worker 用 `NetworkFirst` + `networkTimeoutSeconds: 3` + 缓存兜底
  （调和"每次启动拉最新"与"离线可用"两个要求）。
- 首次访问弹一次性安装提示卡：Android/桌面 Chrome 用 `beforeinstallprompt` 触发真正的
  安装弹窗；**iOS Safari 不支持，只能显示图文说明**告诉用户点分享菜单 →"添加到主屏幕"。

## 明确不做（v0.1 范围外）

- 只做 SICP。Gatsby、西游记、私有书都不进 v0.1。
- **不做与 CLI 事件日志的互通**（不做导入导出），网页版是独立的 streak，从零开始。
- SICP 的 46 道 Exercise 不做（内容包里有数据，网页忽略即可）。
- 不做本地导入内容包、不做多用户、不做云端。

但设计上要**留接口不要堵路**：以后要加书、加导入导出、加私有包。

---

## 已知的坑（请逐条当真）

**1. 不要把 CLI 的渲染细节忠实移植过来 —— 那些是给等宽终端打的补丁，搬到网页上就是"古代网页"。**
具体要删掉的：`wordWrap` 手动按屏幕宽度断行再逐行加缩进前缀（浏览器自己会折行且认识
`padding`，手动断行还会破坏文本选中和复制）；`Code (scheme):` 文字提示和上下两条 `---`
边界线（那是因为终端不解析 Markdown）；用等宽字符画的年历（`core/yearCalendar.ts` 的
`buildYearCalendar` 纯计算部分原样复用，渲染改成 CSS grid 或 SVG）。判断标准：**`core/`
里的纯计算 100% 复用，`cli/` 里的渲染层基本全部重写。**

**2. 必须用 `visibilitychange` 暂停计时。** 终端里进程在前台就是在读，浏览器里用户会切
标签页、锁屏、被来电打断。墙上时间会把"读了 12 分钟"变成"读了 47 分钟"，而分摊模型会
把这个误差平摊到每一块。这不是可选优化，是分摊计时在浏览器里成立的前提。

**3. React 的 StrictMode 会在开发模式下双调用 effect。** 如果把"写 `session_start` 事件"
放在 `useEffect` 里，开发时会写进两条。事件日志是 append-only 的，写脏了不好清。上手时
就要想清楚哪些副作用需要幂等保护（比如按事件 id 去重，`core/mergeEvents.ts` 已经有这个
能力）。

**4. 选项 shuffle 绝不能放在渲染函数体里。** React 每次 setState 都会重新执行组件函数，
shuffle 写在里面的话，用户每点一下选项，四个选项就会重新排列一次。必须在**进入这道题时
算一次**并存进 state（或 `useMemo` 锁住依赖）。这是这个项目里最容易出、也最难看的一个 bug。

**5. Service worker 的自动更新不能打断进行中的 session。** `vite-plugin-pwa` 的
`registerType: "autoUpdate"` 默认行为是新版本就绪就 `skipWaiting` + 刷新页面 —— 如果这
发生在用户读到一半或答到第 3 题时，滚动位置和未落盘的答题状态就没了。正确做法：检测到
新版本时先存一个待更新标记，等用户完成打卡、回到年历页时再应用。
（对照：CLI 上已经被"忘记 `npm run build` 跑了旧 `dist/`"坑过两次，其中一次真写脏了数据。
这是同一个问题的镜像面 —— 那次是更新得不够，这次要防的是更新得不合时宜。）

**6. `username.github.io` 的浏览器存储不按路径隔离。** storage 的作用域是 origin
（协议+域名+端口），**不含路径**。同一个 GitHub 账号下所有 project pages 共享同一个源。
所以 IndexedDB 库名、localStorage 键名一律加 `kuibu:` 前缀。

**7. 浏览器可能驱逐数据。** 默认存储是 best-effort。要调 `navigator.storage.persist()`
申请持久化。另外 Safari 的 ITP 会清掉 7 天内没有以第一方身份访问过的站点的脚本可写存储 ——
日常打卡会不断续期，但"装了不用、隔两周想起来"的亲友可能会丢进度。v0.1 不做导出备份，
所以这条只能先记着，不要假装不存在。

**8. "读完了"按钮会跟常驻 tab bar 打架。** 两块可点区域上下相邻，误触风险实在。给按钮
留 ≥32px 下边距，做成整宽实心，视觉重量明显压过 tab 图标。

**9. 安全区。** `<meta name="viewport" content="viewport-fit=cover">` +
`env(safe-area-inset-bottom)`。底部栏压在 iPhone 小横条底下是最直接的"没做完"信号。

**10. 浏览器不能扫目录。** `cli/discoverPacks.ts` 靠扫 `packs/public/` 找书，网页上做不到。
v0.1 只有一本书可以先硬编码路径，但正确做法是构建期生成一份 `packs/index.json`，请在
设计里留好这个位置。

**11. GitHub Pages 的路径与路由。** `vite build --base=/kuibu/`，所有资源引用要是 base
感知的。静态站没有服务端路由，多视图要用 hash 路由，或者用 `404.html` 兜底的技巧。

**12. 私有内容包绝对不能进网页构建产物。** `packs/private/` 已经在 `.gitignore` 和
pre-commit hook 里，但 vite 的 `publicDir` 复制行为是另一条路径 —— 构建脚本必须确保
`packs/private/` 及任何私有派生物不会被打包进 `docs/` 或 `gh-pages` 分支。这类东西一旦
推上去就是公开分发了。

**13. 不要碰 CLI 的 `.kuibu-events.jsonl`。** 那是阶段一"连续 21 天"验收指标的真实数据。
网页版走 IndexedDB，跟它没有任何交集 —— 开发和测试过程中都不要读写那个文件。

**14. `checkinDate` 的偏移自然日逻辑（默认 offset=4）不变**，`checkin` 事件必须存**已换算
的 `date` 字段**，不能只存 `ts`。浏览器的时区来自用户系统设置且可能随旅行变化，比 CLI
更容易遇到真实漂移。

**15. IndexedDB 是异步的。** CLI 那边"逐条 append 立即落盘"是同步保证，浏览器里不是 ——
用户答完最后一题立刻切走 App，写入可能还没完成。需要考虑写入确认后再更新 UI，或者在
`visibilitychange`/`pagehide` 时 flush。

**16. `answer_index` 在客户端是明文的**，打开 devtools 就能看到。对"自用 + 亲友"的定位
无所谓，不要为此设计任何混淆机制 —— 这是静态部署的固有性质，不是 bug。

**17. 保持现有测试全绿。** 仓库里有 187 个 TS 测试 + 69 个 Python 测试。改动 `core/` 要
格外谨慎（CLI 还在日常使用中）；网页版的新代码请配自己的测试。

---

## 建议的推进节奏

一次只做一个，每个做完我实际在手机上用一次再开下一个。

- **W0 —— 部署链路先跑通。** vite + React + shadcn 起个空壳，页面上只有一句话，直接
  部署到 GitHub Pages，用手机打开确认 `--base=/kuibu/` 路径、HTTPS、可访问性都没问题。
  **先把部署这条路探通，再往里填东西**，不要等做完再发现路径全错。
- **W1 —— 四 tab 骨架 + 年历。** 年历 tab 读 IndexedDB（空数据也要能正常渲染），
  `buildYearCalendar` 原样复用。此时手机上已经能看到应用的真实形状。
- **W2 —— 阅读视图。** 今日 block 一次性展开、增量式标题、代码高亮、"读完了"按钮、
  分摊计时 + `visibilitychange` 暂停、事件落盘。
- **W3 —— 答题 + 打卡闭环。** 到这一步应该能在手机上完整打第一次卡。
- **W4 —— 暗色三态 + PWA + 安装提示卡。**
- **W5 —— 真机打磨。** 间距、触控目标、过渡动效、安全区。

## 请先停下来问我的地方

1. **网页版的界面语言用英文还是中文？** CLI 的用户可见字符串是英文（因为 SICP 是英文书），
   网页版没定过。
2. **年历的色阶用什么颜色？** stone 是纯中性色，`--primary` 基本是接近黑/白，"越读越深"
   没有现成颜色可用。走 stone 自己的灰阶，还是单独配一个色阶。
3. **书架 tab 和设置 tab 在只有一本书时放什么？** 四格底部栏现在有两格接近空
   （书架只有 SICP 一张卡，设置只有暗色三态 + 每日时长目标）。可能需要回头把 tab 减到三个。
4. **任何触碰 `CLAUDE.md` 六条铁律或"明确否决过的方案"的改动**，先停下来问，不要自行决定。
