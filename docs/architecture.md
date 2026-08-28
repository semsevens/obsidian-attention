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
    "hits": ["2026-03-02T…", "2026-06-14T…"],  // 每次被打动的时刻
    "anchor": {
      "kind": "transcript",
      "track": "lecture.whisper.json",  // 标注时用的轨
      "seg": 42,                         // 段索引（同轨快速路径）
      "start": 128.4,                    // 段起始秒（跨轨重锚唯一依据）
      "charStart": 6, "charEnd": 14,
      "quote": "反向传播",
      "prefix": "所以这里的", "suffix": "并不需要"
    },
    "body": null,                        // null = 划线；有内容 = 评论
    "reviewed": []                       // 每次回顾时追加，驱动"优先重现没看过的"
  }]
}
```

### `hits`：同一句可以打动你很多次

一条标注不是「一个时间点」，而是**一串时间点**。再次标记已标过的段落
**不会新建第二条**，而是往 `hits` 里追加一次 —— 因为「同一句话隔半年又打动了我」
是这个插件能记录到的最强信号，去重掉就把它扔了。

`sameSpot()` 判断是否同一处：引用文本相同，且 markdown 看区间是否重叠
（偏移会随编辑漂移，所以不能要求相等）、transcript 看段号或时间是否接近。

顺带决定了分桶口径：**按最近一次 `hits`**，不是第一次。去年标的东西今天又标了一遍，
它属于「今天」。

### 只有一种颜色

per-annotation 配色去掉了。每次标记都要在五个色块里选一个，是把「记一下」变成了
一个决定；而且「标过几次」比「当时选了哪个色」承载的信息多得多。
颜色收成 `settings.markColor` 一个值，通过 `body` 上的 `--at-color` 变量生效，
改色不需要重绘任何东西。

**不做视觉权重**：次数在面板和气泡里用数字显示（`3×`），不编码进下划线粗细。

### 时间展示

`settings.timeFormat` 是一个 **moment 格式串**，默认 `YYYY-MM-DD HH:mm:ss`。
用 moment 而不是自己拼字符串，理由有二：Obsidian 自己到处用它（日记文件名、
Templater），用户已经熟悉这套 token；以及它跟随 Obsidian 的语言设置。

留空则退化成**相对时间**（`3天前`），同样是本地化的 —— 中文 vault 显示中文，
不是硬编码的英文。设置页有实时预览，改完立刻能看到样子。

`moment` 在 Obsidian 的 typings 里被声明成命名空间而非可调用函数，
`src/ui/time.ts` 里用一个窄接口把这个 cast 收敛在一处。

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

### 原文被编辑后，锚点自己跟上

两套机制，性质不同：

**映射（`anchor/repair.ts` + `AnchorTracker`）** —— 笔记在编辑器里被改时，CodeMirror
**确切知道**改了什么，所以锚点是被**搬过去**的，不是事后再搜。这是「自适应」和
「猜」的分界：映射能扛住**在被标句子内部打字**——那种情况存的引用文本在文档里
已经不存在了，任何基于搜索的办法都必然失败。写回做了 800ms 防抖，
因为每敲一个键锚点都在动，而 sidecar 不该跟着动。

| 编辑 | 结果 |
|------|------|
| 前面插入/删除 | 偏移跟着平移 |
| **句中插字** | **标记跟着长大，引用文本同步更新** |
| 句中删字 | 标记跟着缩小 |
| 整句删除 | 变孤儿，**锚点保留最后已知值**（覆盖掉就再也找不回了）|
| **整句被替换** | 变孤儿。跟着替换文字走等于把标记悄悄挪到**你没标过的字**上，看起来还像活着 |

**修复（`noteResolved`）** —— 编辑器之外的改动（别的 app、同步、关着时被改）
只能靠 `resolve()` 找。找到之后**写回**，下次就走精确偏移，不必永远重搜一遍全文。

两者都**不猜**：真的没了就成为孤儿。一条静静落在错误文字上的划线，
比一条承认自己丢了的更糟。

### 失效标注（孤儿）

`resolve()` 找不到的标注**不画** —— 猜一个位置比不画更糟。但**悄悄丢掉更糟**：
你在意的那段文字、以及它打动过你几次，恰恰是最该留下的东西。

所以 `store/orphans.ts` 的 `classify()` 把它们分出来，面板里单列一组
「N lost — the text they marked is gone」，虚线边框 + 删除线，保留原文引用、
评论和全部时间戳。点击不跳转（无处可跳）。

**重新指认**：在笔记里选中新位置，点孤儿条目上的 `⚲`。标注**保持身份不变** ——
id、评论、每一次 `hits` 都还在，只是学会了自己现在住哪。手动重划一条会得到
一条新标注，把这些历史全丢掉。

**同一个文件同时有多个版本在手**：编辑器缓冲区和磁盘内容长期不一致 ——
打字时缓冲区**领先**，切换文件的瞬间缓冲区**滞后**（还装着上一篇的内容）。
所以 `classify()` 接受多个版本，**只有每个版本都找不到才算失效**。

判错的后果是宣布「这个文件里所有标注都丢了」，对这个插件最不该出错的事情来说
是很吓人的误报。空文本同理：那意味着「没读到」，不是「内容没了」。

判断用的文本**优先取编辑器缓冲区**，不是 `cachedRead` —— 后者落后于未保存的输入，
拿过期文本去判「这条丢了」是在撒谎。

只判断 markdown。transcript 锚点是相对当前字幕轨解析的，这里手上没有那份数据；
而字幕文件是生成的、不是手写的，本来就很少丢。

### Live Preview 的 widget 盲区

表格、callout、嵌入块在实时预览里是 **CM6 widget** —— DOM 由 Obsidian 自己渲染，
`Decoration.mark` 盖在它背后的源码区间上**画不出任何东西**。这些内容只在 widget
**被构建时**顺带带上标注，所以现象是「表格里划的线要重开文件才出现」。

补法是刷新时顺带在 `.cm-content` 上跑一遍 `paintQuote`。不需要枚举有哪些 widget：
`paintQuote` 会跳过已经在 `.at-hl` 里的文字，于是 CM6 覆盖到的地方原样不动，
**只补它够不着的部分**。

### 一个容易数错的地方

`MarkdownView.contentEl` 里**同时挂着**源码层（`.cm-content`）和阅读层
（`.markdown-reading-view`），只是同一时刻只显示一层。所以一条标注在 DOM 里会出现
**两次**，`data-at-id` 相同。排查时按 `.at-hl` 计数会以为重复渲染了 —— 不是。

### markdown 两种模式的采集差异

| 模式 | 怎么拿到源文件偏移 |
|------|-------------------|
| 实时预览 / 源码 | 编辑器就是文档，`editor.posToOffset()` 直接给精确偏移 |
| 阅读模式 | DOM 是渲染后的 HTML，**根本没有源偏移** → 见下 |

### 阅读模式：投影 + 序号

阅读模式给到的选区是对着**渲染结果**做的，而锚点必须用源文件偏移表达。两者在有
标记的地方就是对不上的：`**加粗**` 渲染后短了 4 个字符，`[文字](链接)` 只剩文字，
图片整个消失。

早期做法是要求选中的字符串在源文件里**原样存在** —— 结果是任何含强调、链接、
高亮的选区都标不了。在真实笔记里，那是大多数选区。

现在 `anchor/plainText.ts` 把源文件**投影**成「去掉行内标记的纯文本」并记录
每个字符来自源文件哪个位置，在投影上搜、再映射回去。故意做得浅：只处理实践中
会挡路的行内标记，不做完整 markdown 解析 —— 关键是投影和偏移表始终同步。

序号映射用来区分重复短语。**必须在阅读容器内数，不能用 `contentEl`** ——
后者同时装着源码层和阅读层，跨着数会把整篇文档数两遍，于是去找一个不存在的
「第 2 次出现」。这个坑踩过两次了。

### 标记图片

图片没法划选，所以入口是**右键图片** —— 编辑模式挂在 `editor-menu` 上，阅读模式走
自己的 `contextmenu`。菜单项：`Mark image` / `Comment on image…`；已标记的图片
右键则是编辑评论 / 再标一次 / 删除，左键点开气泡。

锚点用的是**图片那段 embed 源码**（`![alt](url)` 或 `![[file.png]]`）作为 quote。
于是重复标记、编辑后重锚、失效检测全都原样复用，不需要知道这条恰好是张图。

### 面板里的图片预览：交给 Obsidian 渲染

回顾面板不自己去解析图片地址，而是把那段 embed 原文交给
`MarkdownRenderer.render(app, quote, el, sourcePath, this)`。

好处是**别的插件的后处理器也会在这条管线里跑** —— 那个把远程图片换成本地缓存的
插件同样生效，于是面板里的缩略图和笔记里看到的**完全一致**。自己去猜 URL
（vault 解析 → hint 反查 → 远程回退）能做，但每加一个改写图片的插件就要多猜一次。

### 嵌入的笔记（transclusion）

`![[另一篇笔记]]` 和 `![[图.png]]` 写法完全一样。原来 `findImageEmbeds` 不加区分，
于是在被嵌入的笔记里标注时，宿主源码里只有那一个「embed」，**整篇嵌入笔记被当成
了标注对象**。现在 wiki 形式的 embed 必须指向图片扩展名才算图片；
markdown 形式（`![](url)`）一律算图片，因为远程图床常常没有扩展名。

**归属**：嵌入笔记里的文字是**那个文件**的内容，标注就该归它。锚到宿主上的话，
宿主里根本没有那段文字，标注永远解析不了，嵌入位置一变就消失。

阅读模式下 Obsidian 把 transclusion 渲染成**嵌套的 `.markdown-preview-view`**，
外面包着 `<span class="internal-embed markdown-embed" src="链接">`。
`embeddedFileAt()` 从选区往上 `closest()` 找到它，用 `src` 解析出真实文件。

序号计数也要相应收窄到 `.markdown-embed-content` 内 —— 嵌入内容是另一个文件，
页面上别处的同名短语不属于它。

**读宿主时也要看得见**（`store/transclusions.ts`）：

- **面板**「本篇」在自己的标注之后，另起一组 `From embedded notes` 列出被嵌入笔记的
  标注，并显示来源文件名（操作它们改的是另一个文件）。宿主自己没有标注时
  **不能提前 return** —— 否则这一组永远走不到。
- **点击**：嵌入里的高亮属于**被嵌入的文件**，所以查标注、右键菜单都要先
  `embeddedFileAt()` 换成那个文件 —— 用宿主去查，它根本没听说过这条标注。
- **涂色**：阅读模式下 Obsidian 会用被嵌入文件的路径调用后处理器，所以本来就画得出来；
  但**实时预览**把 transclusion 渲染成 widget，只用宿主的标注去涂就什么也涂不上，
  表现为「刚标完不显示，重开才有」。现在按每个 `.internal-embed` 容器分别涂，
  用它自己那个文件的标注 —— 分容器是为了避免两处嵌入共享的短语被涂到错的那个里。

只向下一层。嵌套嵌入很罕见，而每多一层都要在每次渲染时多读一次 metadata cache；
真要看，直接打开那篇笔记就是了。

另外选区所在的视图改成**从 DOM 反查**，不再依赖「当前活动视图」：
侧栏可能持有焦点，分屏里选中的那一栏也未必是活动的。

### 图片：源码里的 embed 和屏幕上的 `<img>` 未必对得上

这是设计上最容易想当然的地方。**不能假设渲染出的 `src` 和源码里的 embed 有关系**：

- 把远程图片缓存到本地的插件：源码是 `https://mmbiz.qpic.cn/...`，渲染出的却是
  `app://.../raw/cloud/_archive/6f/6fb8e8d4...`，两者毫无共同子串
- 绘图插件（Excalidraw）：渲染成 blob/data URI
- `metadataCache.embeds` 也帮不上忙 —— Obsidian 不把 markdown 式远程图片记成 embed

所以做了三层，**远程和本地都要能用**：

| 环节 | 主路径 | 兜底 |
|------|--------|------|
| **采集** | `src` 匹配 embed 目标 | 按图片**周围的文字**定位（`embedBySurroundings`）|
| **涂色** | `src` 匹配 embed 目标 | 匹配 `anchor.imageHint`（标注时记下的 src 特征）|
| **解析** | embed 原文 | 按周围文字找（`resolveMarkdown`）|

**解析那一层的兜底是防插件冲突的关键**：如果缓存插件哪天把源码里的 URL 也改写成
本地 embed，标注的 quote 就凭空消失了 —— 但图片旁边的说明文字没变，靠它还能找回来。
没有这一层的话，那一刻整篇笔记的图片标注会同时变成孤儿。

`imageHint` 取 src 的最后一段路径（去掉 query，因为 Obsidian 会给 vault 资源附加
变动的时间戳），只作提示：它失效了还有 embed，embed 失效了还有周围文字。

**画法不同**：embed 投影到渲染文本是**空的**，没有字符串可包裹。所以
`paintImage.ts` 反过来按「这张图指向什么」去找 `<img>`，给它加一圈
`outline`（内描边，不撑动周围文字）。带评论的用双线。

**`|尺寸` 必须剥掉**：`![[图.png|300]]` 是所有人调整图片大小的写法，
`|300` 不是 target 的一部分。带着它去匹配什么也匹配不上 —— 这正是
「could not find that image」的成因。markdown 路径还要 `decodeURIComponent`，
因为源码里是百分号编码、而渲染出的 src 解码后才是真实文件名。

**左键弹三选一**：点图片给出 `Mark` / `💬` / `🔍`。放大没有被剥夺，只是变成三个
选项之一 —— 直接抢走它会让被标记的图片表现得和 vault 里其它图片不一样。

放大是**在 capture 阶段拦下原点击**、再由 🔍 按钮**重新派发**同一个事件实现的
（Obsidian 的图片查看器绑在事件上、不是一个可调用的 API，重放是唯一的交还方式）。
重放时用 `passingThrough` 标志避免拦到自己发出的那一下。

排查时被骗过一次：合成 `MouseEvent` 触发不了放大 —— 其实是因为图片当时
`getBoundingClientRect()` 是 0×0（滚动出视口），并不是合成事件无效。
滚到可见位置后合成点击是能触发的。

**排查提醒**：阅读模式是**虚拟滚动**的，只渲染视口附近的块。用
`querySelectorAll('img')` 数出 0 张很可能只是图片当时不在 DOM 里，
不代表涂色坏了 —— 这个假象骗了我两次。

阅读模式还额外挂了 `layout-change` 上的重涂：切换到阅读模式时 Obsidian 可能复用
标注之前的渲染缓存，标记就不见了。两个涂色函数都是幂等的，重跑一遍很便宜。

### 涂色要能跨节点

存的引用是**源文件文本**，画到渲染 DOM 上之前要先 `strip()` 掉标记，
否则会去找从没画出来的星号。

而且一条跨越 `**加粗**` 的划线在渲染 DOM 里是**三个文本节点**。`paintQuote` 把容器
的全部文本拼成一个字符串来匹配，再逐节点包裹（**从后往前**，因为包裹会切分节点、
让右边的偏移失效）。只在单个文本节点里匹配 —— 最直觉的写法 —— 会静默漏掉的
恰恰是这类划线。

**标注挂在媒体上而非字幕轨上**，就是为了让"换个 ASR 引擎重新转录"不至于让标注全部消失 ——
时间轴是跨轨唯一不变的东西，这是 `start` 必须存在的原因。

对不上的进回顾面板的"失效标注"分组，手动重指认。md 一定会有掉锚，这点不做幻想。

## 回顾：时间桶，不是间隔重复

刻意**不用 SM-2**。间隔重复是为背诵设计的，需要你给每条打"记得/不记得"；而这里的
目标不是「记住」某段话，是「重新遇见」它。所以：

- **时间桶**：今天 / 本周 / 本月 / 更早（`AttentionIndex.buckets()`）
- **Resurface**：随机 N 条，优先没被回顾过的（`resurface()` 按 `reviewed.length` 排序）

## transcript 宿主

### 与 media-transcript 的接口：单向广播

media-transcript 侧只加了两样东西（约 30 行）：每段字幕带上
`data-mt-seg` / `data-mt-start`，以及每次重建字幕 DOM 后派发一个冒泡的
`mt:transcript-rendered`（detail 里带 `mediaPath` / `trackPath`）。

同时在 `.mt-transcript` 上写 `data-mt-media` / `data-mt-track`。**两者都要**：
事件只能被当时在听的人收到，而属性随时可读 —— Attention 在字幕已经打开之后才被
启用时收不到事件，全靠属性。所以 `panelOf()` 一律从 DOM 读，不缓存事件里的状态。

**它不知道 Attention 存在**。Attention 监听这个事件后幂等重贴自己的高亮 ——
所以不用去理解「对方哪个操作会让我的装饰失效」（搜索高亮重写 `.mt-txt` 就是一例，
那里也补了一次广播）。没装 media-transcript 时事件永远不来，这个宿主自然休眠。

### 跨轨重锚

标注挂在**媒体文件**上，一个媒体可能有多条字幕轨。`resolveTranscript()` 分四级：

| 结果 | 条件 |
|------|------|
| `exact` | 同一条轨、段号还在、偏移处就是原文 |
| `drifted` | 同一条轨、段号还在、原文在段内挪了位置 |
| `retimed` | **换了轨** —— 在 `start` ±3s 的窗口里找候选，按残存上下文打分 |
| `unique` | 时间窗里没有，但全轨只出现一次 |

四级都不中返回 null，**刻意不画**。有多个远距离候选时也返回 null —— 宁可显示为
孤儿，也不要在错误的位置画一条看起来很合理的线。

实测（`_test/attention/`）：在 12 段的 `whisper.json` 上标注，切到 24 段、
措辞不同的 `讲座.srt`（`先验权重` vs `鲜艳权重`），高亮正确落在对应那一行。

### 与 media-transcript 的交互分工

| 动作 | 归谁 |
|------|------|
| 点**时间戳** | media-transcript：seek + play |
| 点/拖**文字** | 选中 → Attention 弹浮层 |
| 右键**有选区或高亮上** | Attention（capture 阶段 `stopPropagation`，避免两个菜单叠一起）|
| 右键**其它位置** | media-transcript 原有菜单 |

原来点整行就 seek，和划词抢同一个点击。按**目标元素**分工比按「有没有选区」猜可靠。

### 采集限制

选区**必须落在同一行字幕内**。跨行选择没有单个 segment 可锚，会弹 Notice 拒绝，
而不是硬拆成两条或静默存一条错的。

## 点开 sidecar 会跳到被标注的文件

`.json` 被 media-transcript 整体注册了（扩展名只能整个占，没法按文件挑），
所以 `<笔记>.anno.json` 也会被它接走，然后报一句误导的「找不到媒体文件」。

处理放在 **Attention** 这边：监听 `file-open`，发现是 sidecar 就改开它标注的
那个文件。命名约定的知识留在定义它的地方，media-transcript 不必知道
`.anno.json` 是什么东西。

**重入坑**：这段代码跑在 `file-open` 处理器**内部**，而 Obsidian 会在处理器返回
**之后**才完成自己的打开流程 —— 在这里直接 `openFile` 会被它随后覆盖掉，
表现和「跳转根本没触发」一模一样。实测 `setTimeout(0)` 不够、`50ms` 可以，
但赌一个固定数字太脆，所以改成**重试到当前文件确实变了为止**（最多 8 次 × 40ms），
且当前文件已经不是 sidecar 时立刻停手。

**已知窄窗口**：点开 sidecar 后 40ms 内又手动切到别的文件，重试可能把你拉回来。
需要人手做到 20ms 级别，没有为它再加机制。

孤儿 sidecar（被标注的文件已删）不跳转，弹 Notice 说明标注还在、删掉这个文件
才会一起丢。

## 面板：一个面板，两个视角

同一批数据，两个不同的问题，所以共用一个面板而不是占两个侧栏位：

| 视角 | 排序 | 回答的问题 |
|------|------|-----------|
| **本篇** | **文档顺序** | 这篇里我标了哪些（像大纲）|
| **全库** | 时间桶 | 这周/这月我的注意力花在哪 |

### 排序

`store/sorting.ts` 是纯函数，因此可测 —— 一个悄悄退化成「索引里恰好是什么顺序」
的排序，要等到你去找某条却找不到时才会被发现。

| 选项 | 依据 |
|------|------|
| Document order | 文档中的位置（**仅「本篇」**）|
| Recently marked | 最近一次 `hits`（「全库」下按时间分桶）|
| Times marked | `hits.length` 降序，同数按最近 |
| First marked | 第一次 `hits` 升序 |

从「本篇」切到「全库」时，`resolveSort()` 会把不适用的「文档顺序」退回
「最近标记」—— 否则标签写着某种顺序、实际却是任意顺序。

「全库」只有默认排序按时间分桶：选了别的排序还硬塞时间小标题，是在回答另一个问题。

「本篇」的文档顺序要读一次原文、把每条 `resolve()` 出位置再排（`inDocumentOrder()`）。
孤儿（resolve 返回 null）排到最后，因为它们已经没有位置可言了。

### 条目的排版

每条是「**内容**在上，**出处 · 时间**在下」。下面那行左右分列：

```
文件名（左，可截断）              次数 · 时间（右对齐）
```

时间右对齐是有意的 —— **它会形成一列**，扫「什么时候」时眼睛沿一条直线走，
不用在每行里找。文件名是变长的、时间是定宽的，所以让文件名吃掉剩余空间并截断。

`.md` 后缀去掉（每行都有，不提供信息），数字用 `tabular-nums`，否则等宽对齐会假。

「本篇」视图下不显示文件名 —— 每行都一样，是纯噪音。

图片标注显示缩略图而不是 embed 原文，见下。长文字截到 4 行，
且允许在无空格长串中间断行（URL 会撑破侧栏）。

### 行内操作

每条 hover 时露出 **＋ / 💬 / ✕**，右键给完整菜单（跳转 / 再标一次 / 评论 /
复制原文 / 删除）。

**＋ 是「又被打动了一次」** —— 一段话重新浮上心头时，这件事本身值得记，
哪怕你此刻并没在原文里看着它。走 `store.markAgain(path, id)` 按 id 递增，
面板手里拿的是标注本身、不是文字，不该为了说一句「它还重要」去重建一个锚点。

次数只在 **>1 时**显示（`3×`）：标过一次是常态，给每条都挂个 `1×` 是噪音。
按钮上 `stopPropagation`，否则会连带触发整条的「跳转到原文」。

平时**隐藏**：这是个可能很长的列表，常驻按钮会让它读起来像控制面板而不是列表。

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

## 官方社区审核的两条硬规则

自动审核会拦下两类写法（`obsidian-plugin-publishing/README.md` 有完整清单）：

- **`no-static-styles-assignment`**：不能 `el.style.x = …`，要用 `setCssStyles()` /
  `setCssProps()`。浮层定位和那个 `--at-color` 变量都改过来了。
- **`no-unsupported-api`**：用了比 `minAppVersion` 更新的 API 就是 Error。
  `loadIfDeferred` / `isDeferred` 是 **1.7.2** 引入的，而修复「面板一片空白」
  必须用它们，所以 `minAppVersion` 定在 1.7.2。
  `fileManager.trashFile`（1.6.6）换成了 `vault.trash(file, true)`（0.9.7）——
  行为一样，不必为它抬高门槛。

## 开发与测试

```bash
npm run dev    # esbuild watch，每次构建后自动复制到 dev vault
npm test       # vitest
```

**部署用复制，不用软链** —— 本 repo 在 iCloud Drive 上，把 vault 指向 iCloud 路径
有 Obsidian 卡在被 evict 的文件上的风险。复制只要几毫秒，且 vault 保持自包含。

**部署到哪是这台机器的属性，不是插件的属性**：从 `VAULT_PLUGIN_DIR` 或一个
gitignore 掉的 `.dev-vault` 文件（内容是 vault 根目录）读，两者都没有就不部署。
构建时会写一个 `.hotreload` 标记文件，装了 pjeby/hot-reload 就能存盘即重载。

`styles.css` 不是 esbuild 的输入，所以单独 watch —— 改 CSS 不必去碰某个 .ts 文件
才能触发部署。

### 用 CDP 直接调试运行中的 Obsidian

Obsidian 是 Electron 壳，可以开远程调试口，然后像调浏览器一样连上去：

```bash
osascript -e 'tell application "Obsidian" to quit'
open -a Obsidian --args --remote-debugging-port=9333
```

之后 `curl http://127.0.0.1:9333/json/list` 拿到渲染进程的 target，用
`Runtime.evaluate` 就能在 Obsidian 的上下文里跑任意 JS —— 读 `app.workspace`、
遍历 leaf、`app.plugins.disablePlugin/enablePlugin` 强制重载、挂
`MutationObserver` 看 DOM 变动、抓 `Runtime.consoleAPICalled` 收控制台。

**注意**：用 `nohup` 后台拉起时窗口不会被正常呈现，量出来的 `getBoundingClientRect`
全是 0，挂载状态也不可信。必须 `osascript -e 'tell application "Obsidian" to activate'`
之后再测。

这套东西的价值在「面板一片空白」那次体现得最清楚：静态读代码猜了五六轮都没中，
连上 CDP 之后三条命令就定位到 `contentEl` 根本不在文档里，再二分到具体那一行。

### 一类必须防的 bug：遮蔽基类成员

`ReviewView extends ItemView`，而 `View.prototype.open` **正是 Obsidian 用来挂载
视图的方法**。我定义了一个 `private async open(annotation, targetPath)` 把它盖掉，
于是 Obsidian 调 `view.open()` 进了我的方法、参数是 undefined、第一个 if 直接
return —— 视图构造成功、`render()` 也画得好好的，但**整棵 DOM 从未进入文档**。

同一类问题之前还撞过一次：`private scope` 遮蔽 `View.scope`（键盘作用域）。
那次编译器报了错，因为类型不兼容；`open` 这次类型恰好兼容，**编译器沉默**。

`tests/baseClassCollisions.test.ts` 就是为此存在的：把真实 Obsidian 里
`ItemView` 原型链上的成员名抓出来，扫 `src/views/*.ts` 里声明的成员，撞了就炸。
它还带一条自证用例，确保检测器本身有效。

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
| transcript 宿主 | ✅ 可用（含跨轨重锚，9 个测试）|
| 点回顾条目 seek 回音频 | ✅ 可用 |
| 失效标注分组 | ⬜ 待实现 |
