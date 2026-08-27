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
| markdown | 高 | 文件可编辑，偏移必失效 → `from/to` 只是提示，`quote` 优先，命中后回写偏移 |

**标注挂在媒体上而非字幕轨上**，就是为了让"换个 ASR 引擎重新转录"不至于让标注全部消失 ——
时间轴是跨轨唯一不变的东西，这是 `start` 必须存在的原因。

对不上的进回顾面板的"失效标注"分组，手动重指认。md 一定会有掉锚，这点不做幻想。

## 回顾：时间桶，不是间隔重复

刻意**不用 SM-2**。间隔重复是为背诵设计的，需要你给每条打"记得/不记得"；而这里的
目标不是「记住」某段话，是「重新遇见」它。所以：

- **时间桶**：今天 / 本周 / 本月 / 更早（`AttentionIndex.buckets()`）
- **Resurface**：随机 N 条，优先没被回顾过的（`resurface()` 按 `reviewed.length` 排序）

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

## 现状

| 模块 | 状态 |
|------|------|
| 数据模型 / sidecar 读写 | ✅ 可用 |
| 重命名跟随、删除处理 | ✅ 可用（文件夹移动无需处理：sidecar 是兄弟，跟着走）|
| 注意力索引 + 时间桶 + resurface | ✅ 可用 |
| 回顾面板 | ✅ 骨架可用（列表、分组、点击跳转、标记已回顾）|
| `AnnotationHost` 接口 | ✅ 已定义 |
| transcript 宿主 | ⬜ 待实现（含 media-transcript 侧的广播改动）|
| markdown 宿主（阅读模式 + CM6 实时预览）| ⬜ 待实现 |
| 划选浮层（选色 / 写评论）| ⬜ 待实现 |
| 失效标注分组 | ⬜ 待实现 |
