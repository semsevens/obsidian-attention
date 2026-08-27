# 架构

> 定位：**注意力档案**。记录你在库里留下的注意力痕迹（划线、评论，以及可选的
> 重播计数），并支持**定期回顾**。标注只是采集手段，回顾才是目的。
>
> 硬约束：**永不修改被标注的原始文件**。

## 为什么不是又一个标注插件

社区里标注类插件有 20+ 个，但它们要么改原文（`enhanced-annotations` 依赖
`==高亮==` 内联语法），要么只处理 PDF/EPUB（`book-note`、`local-pdf-annotator`），
要么只导入外部高亮（三个 Readwise 插件）。回顾类插件（`obsidian-spaced-repetition`、
`repeat-plugin`、`simple-note-review`）则只回顾**笔记本身**。

**没有一个回顾你在自己库里留下的注意力痕迹** —— 这是本插件的位置。

## 文件结构

```
obsidian-attention/
├── manifest.json
├── src/
│   ├── main.ts                  # 入口：索引生命周期、重命名/删除跟随、回顾视图注册
│   ├── settings.ts              # 设置类型 + 设置页
│   ├── model.ts                 # Annotation / Anchor 数据模型
│   ├── store/
│   │   ├── sidecar.ts           # <file>.anno.json 的命名、读写
│   │   └── attentionIndex.ts    # 跨文件时间索引（派生数据，可重建）
│   ├── hosts/
│   │   └── host.ts              # 宿主适配器接口（markdown / transcript）
│   └── views/
│       └── ReviewView.ts        # 回顾面板
└── styles.css
```

## 存储：sidecar 是事实来源，索引是派生数据

```
lecture.mp4              ← 原始文件，永不改动
lecture.whisper.json     ← 字幕轨 A
lecture.vibevoice.json   ← 字幕轨 B
lecture.mp4.anno.json    ← 标注（唯一一个）
周报.md
周报.md.anno.json
```

**命名规则**：`<原文件名全称>.anno.json` —— 保留原扩展名。理由：

1. `lecture.mp4` 和 `lecture.m4a` 各有各的标注，不抢文件。
2. 反查是纯后缀剥离（`v1.2.final.mp4.anno.json` → 截掉固定后缀即可），
   不用像 media-transcript 的 `findMediaForSubtitle` 那样"枚举每一级点分前缀逐个试"。
3. 天然不匹配 media-transcript 的字幕正则 `^{base}(?:\.([^.]+))?\.(srt|vtt|json)$`
   （中间多了一段），不会被误认成 marker 为 `anno` 的字幕轨。

**为什么 per-file sidecar 而不是全局 DB**：库在 iCloud 上，全局单文件是同步冲突的
重灾区（两台机器各标一条 = 整个文件冲突）。per-file 把冲突面缩到最小，也便于随媒体一起搬走。

**为什么还需要索引**：回顾是**跨文件按时间**查询（"这周标了什么"），而 sidecar 按
**文件**组织。与其为了查询扭曲存储格式，不如维护一份派生索引。它放在插件自己的
data 目录、不同步、不进 git，坏了/丢了全库重扫一次即可（`AttentionIndex.rebuild()`）。

## 数据模型

一条标注 = 锚点 + 可选正文。**划线和评论不是两种东西**，是同一种东西的两个状态
（`body === null` 即划线）。分文件存会导致锚定模型写两遍，且"给划线补一句话"这个
高频操作要变成删+插+建引用。

```jsonc
{
  "version": 1,
  "target": "lecture.mp4",
  "annotations": [{
    "id": "k3f9a2",
    "anchor": {
      "kind": "transcript",
      "track": "lecture.whisper.json",  // 标注时用的轨
      "seg": 42,                         // 段索引（同轨快速路径）
      "start": 128.4,                    // 段起始秒（跨轨重锚唯一依据）
      "charStart": 6, "charEnd": 14,
      "quote": "反向传播",
      "prefix": "所以这里的", "suffix": "并不需要"
    },
    "color": "#f5c542",
    "body": null,                        // null = 划线；有内容 = 评论
    "created": "2026-08-27T10:12:00Z",
    "reviewed": []                       // 每次回顾时追加，驱动"优先重现没看过的"
  }]
}
```

## 锚定与重锚

| 宿主 | 难度 | 策略 |
|------|------|------|
| transcript | 低 | 字幕文件基本不变 → `seg` + `charStart/End` 直取，`quote` 校验 |
| transcript（换轨）| 中 | 用 `start` 在 ±3s 圈候选段 → 段内搜 `quote` → 退化到 `prefix`/`suffix` 模糊 |
| markdown | 高 | 文件可编辑，偏移必失效 → `from/to` 只是提示，`quote` 才是身份 |

`resolve()` 依次尝试四条路径，并把用了哪条报告出来（`how` 字段），
方便将来在 UI 上区分「原位」和「已漂移」：

1. `exact` —— 存的偏移处就是原文，绝大多数情况走这条
2. `context` —— 多处同名，按残存的 prefix/suffix 打分选最像的一处
3. `unique` —— 全文只出现一次，直接用
4. `nearest` —— 上下文也没了，只剩位置这一个信号，取最近的一处

四条都不中就返回 null（孤儿），**刻意不画**而不是瞎猜。

### 视觉：默认下划线，不是背景填充

三个理由：

1. 初衷是记录**所有**注意力 → 标记会很多 → 满屏色块的笔记没法读。
2. 背景填充和原生 `==高亮==` **撞脸**，而这恰恰是最需要一眼分辨的区别
   （一个写进正文，一个不碰正文）。
3. 背景填充会盖住选中态 —— 浏览器的 selection 画在文字背景**下面**，
   不透明填充会让「选中了但看不出来」。半透明只是缓解，下划线根本不占那一层。

带评论的标注额外叠一层 18% 的淡背景 —— 视觉权重跟着投入的注意力走。
`settings.markStyle` 可切回背景填充，通过 `body.at-style-background` 生效，
所以切换不需要重绘任何装饰。

### 交互：两条路并存

- **选完即弹**（`settings.popoverOnSelection`，默认开）—— Hypothes.is / Google Docs
  那套。少一步，代价是只想复制文字时也会弹。只认左键，且落在已有高亮或浮层
  自身上时不触发。
- **右键菜单**（始终可用）—— 显式采集。因为它是**追加**到 Obsidian 原生菜单的，
  留着没有代价，所以不做成互斥开关。

两者共用同一个 `capture()`，保证两条路拿到的锚点完全一致。

右键在两种模式走两条不同的路，因为只有编辑模式有 `editor-menu` 事件：

| 模式 | 挂载点 |
|------|--------|
| 实时预览 / 源码 | `workspace.on('editor-menu')` —— **追加**到 Obsidian 原生菜单，剪切/复制/粘贴原样保留 |
| 阅读模式 | 自己监听 `contextmenu`。**只在确实有东西可给时**才 `preventDefault()`，否则放行原生菜单 |

右键的目标元素用一个 capture 阶段的监听器提前记下（`lastTarget`），因为
`editor-menu` 的回调签名里没有 DOM target —— 而判断「右键点在已有高亮上」需要它。

`MenuItem` 在 1.13.1 的公开 API 里没有子菜单，所以选色复用了那个浮层：
菜单项 `Highlight in colour…` 打开它。默认色直接 `Highlight` 一步到位。

### 与原生 `==高亮==` 的取舍

原生 `==` 在**抗编辑**上更强：标记长在文字里，文字怎么动它都跟着，永远不会掉锚，
而且换任何 markdown 工具都还在。Attention 靠 quote 重锚，改动大了会变孤儿。
这是「不碰原文」的真实代价 —— 换来的是颜色、评论、时间戳和跨文件回顾。

### markdown 两种模式的采集差异

| 模式 | 怎么拿到源文件偏移 |
|------|-------------------|
| 实时预览 / 源码 | 编辑器就是文档，`editor.posToOffset()` 直接给精确偏移 |
| 阅读模式 | DOM 是渲染后的 HTML，**根本没有源偏移** → 用选中文本 + 序号映射：数一下屏幕上它前面有几个相同字符串，取源文件里同序号的那一个（渲染会丢标记，但正文顺序不变）|

阅读模式的已知限制：选区**跨越行内标记**（从正文拖进 `**加粗**`）时，
源文件里不存在这个连续字符串，会弹 Notice 拒绝，而不是静默存一条错的。
实时预览下同样的选区是正常的。

**标注挂在媒体上而非字幕轨上**，就是为了让"换个 ASR 引擎重新转录"不至于让标注全部消失 ——
时间轴是跨轨唯一不变的东西，这是 `start` 必须存在的原因。

对不上的进回顾面板的"失效标注"分组，手动重指认。md 一定会有掉锚，这点不做幻想。

## 回顾：时间桶，不是间隔重复

刻意**不用 SM-2**。间隔重复是为背诵设计的，需要你给每条打"记得/不记得"；而这里的
目标不是「记住」某段话，是「重新遇见」它。所以：

- **时间桶**：今天 / 本周 / 本月 / 更早（`AttentionIndex.buckets()`）
- **Resurface**：随机 N 条，优先没被回顾过的（`resurface()` 按 `reviewed.length` 排序）

## 面板：一个面板，两个视角

同一批数据，两个不同的问题，所以共用一个面板而不是占两个侧栏位：

| 视角 | 排序 | 回答的问题 |
|------|------|-----------|
| **本篇** | **文档顺序** | 这篇里我标了哪些（像大纲）|
| **全库** | 时间桶 | 这周/这月我的注意力花在哪 |

「本篇」必须按**文档顺序**而不是创建时间 —— 大纲要跟着文档走。索引里存的是
创建序，所以 `inDocumentOrder()` 会读一次原文、把每条 `resolve()` 出位置再排。
孤儿（resolve 返回 null）排到最后，因为它们已经没有位置可言了。

`settings.autoRevealPanel`：打开一篇**有标注的**笔记时自动显示面板，没标注就不打扰。
用 `focus: false` 打开 —— 帮你把侧栏亮出来是好意，把光标从正文里抢走不是。

## 采集：显式 + 一个隐式信号

- **显式**：划线、评论。可靠但稀疏。
- **隐式**：字幕段的**重播次数**（`Annotation.replays`）。信号强、噪音低、采集便宜
  （media-transcript 已有 `timeupdate`/seek）。默认**关闭** —— 这类数据比较私密。

停留时长、搜索词等其它隐式信号暂不采集：噪音大，且价值未验证。

## 宿主适配器

`AnnotationHost`（`src/hosts/host.ts`）是唯一的横切接口，让 CodeMirror 那套东西不会
渗进 transcript 代码，反之亦然。`render()` **必须幂等** —— 宿主会因为自己的原因重绘
（md 编辑器 reflow、transcript 的搜索高亮重建 `.mt-txt`），届时会用同样的输入再调一次。

### transcript 宿主需要 media-transcript 配合

media-transcript 侧要加约 30 行：

```ts
// renderSegments() 里给每段稳定锚点
el.dataset.mtSeg = String(seg.index);
el.dataset.mtStart = String(seg.startTime);

// renderSegments / applySearch / clearHighlights 三处之后各广播一次
this.contentEl.dispatchEvent(new CustomEvent('mt:transcript-rendered', {
  detail: { mediaPath: this.mediaFile?.path, trackPath: /* 当前轨 */ },
}));
```

单向依赖：media-transcript 不知道本插件存在，只是往外喊一声；本插件监听后幂等重贴。
没装 media-transcript 时该 adapter 自动跳过。

## 开发与测试

```bash
npm run dev    # esbuild watch，每次构建后自动复制到 dev vault
npm test       # vitest
```

**部署用复制，不用软链** —— 本 repo 在 iCloud Drive 上，把 vault 指向 iCloud 路径
有 Obsidian 卡在被 evict 的文件上的风险。复制只要几毫秒，且 vault 保持自包含。
目标目录由 `VAULT_PLUGIN_DIR` 覆盖，置空则跳过（CI 就是这么做的）。
构建时会写一个 `.hotreload` 标记文件，装了 pjeby/hot-reload 就能存盘即重载。

`styles.css` 不是 esbuild 的输入，所以单独 watch —— 改 CSS 不必去碰某个 .ts 文件
才能触发部署。

### 冒烟测试（`npm run smoke`）

`scripts/smoke.cjs` 用 stub 顶掉 `obsidian` 和 `@codemirror/*`，在 Node 里
**把构建产物真正加载起来**，跑 `onload()` → `onLayoutReady()` → 构造 ReviewView
→ `onOpen()` → 点 ribbon，并把渲染出的 DOM 树打印出来。

存在的理由很具体：**Obsidian 会把插件加载期的异常吞掉**，表现就是「插件装了但什么
都不发生」，控制台里也未必醒目。单测覆盖不到 `onload` 这条装配路径，而它恰恰是
最容易因为一次改名或一个 undefined 就整个死掉的地方。

它不能替代手测（没有真实 DOM、没有 CodeMirror），但能在三秒内回答
「是代码坏了还是环境坏了」——这个问题手工排查一次要十几分钟。

### 测什么、不测什么

**测纯逻辑**：`store/paths.ts`（sidecar 命名与反查）和 `store/review.ts`（分桶与
resurface 排序）。这两块决定「你标过的东西还能不能被找到、还会不会再出现」，
而且**错了是静默的** —— 手工点击恰恰发现不了。所以它们被刻意剥离成不 import
`obsidian` 的纯模块。

其中一条测试直接把 media-transcript 的字幕正则写进断言，锁死「`.anno.json` 不会被
误认成 marker 为 `anno` 的字幕轨」这个跨插件约束 —— 将来谁改 `SIDECAR_SUFFIX`，
测试会先炸。

**不测 UI 层**：宿主适配器和回顾面板是 DOM 胶水，单测收益低于维护成本，走手工。
这跟 media-transcript 全盘不写测试的取舍一致 —— 区别只在于 Attention 有一块
真正值得测的纯逻辑，而 media-transcript 几乎没有。

## 现状

| 模块 | 状态 |
|------|------|
| 数据模型 / sidecar 读写 | ✅ 可用 |
| 重命名跟随、删除处理 | ✅ 可用（文件夹移动无需处理：sidecar 是兄弟，跟着走）|
| 注意力索引 + 时间桶 + resurface | ✅ 可用 |
| 回顾面板 | ✅ 两个视角：本篇（文档顺序）/ 全库（时间桶）+ Resurface |
| 点条目跳回原文并闪一下 | ✅ 编辑模式选中范围，阅读模式滚到 span |
| 单元测试 | ✅ 13 个，覆盖命名与回顾策略 |
| dev vault 自动部署 | ✅ 构建即复制 |
| `AnnotationHost` 接口 | ✅ 已定义 |
| 锚定 / 重锚（`anchor/textQuote.ts`）| ✅ 可用，14 个测试 |
| markdown 宿主（阅读模式 + CM6 实时预览）| ✅ 可用 |
| 右键菜单 + 选色浮层 + 评论弹窗 | ✅ 可用 |
| transcript 宿主 | ⬜ 待实现（含 media-transcript 侧的广播改动）|
| 失效标注分组 | ⬜ 待实现 |
