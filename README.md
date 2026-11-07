# 你是霍格沃茨哪个学院？

一个面向小红书的移动端「分院帽」测试 H5：16 道题，让分院帽看穿你的灵魂，把你分进格兰芬多、斯莱特林、拉文克劳或赫奇帕奇之一，并可生成 1080×1440 的分院卡供用户晒图传播。

纯静态实现，无框架、无构建、无后端依赖，双击 `index.html` 即可运行。

## 功能

- 验证码解锁页 → 开始页 → 16 道题 → 分院结果页，完整流程
- 支持「上一题 / 下一题」，可回退修改答案，分数实时重算
- 答题进度实时存 `sessionStorage`，刷新页面不丢答案
- 结果页四维雷达图，直观展示人格倾向（勇气 / 野心 / 理性 / 忠诚）
- 一键复制晒单文案（含话题标签），降低用户发笔记门槛
- 结果卡保存：iOS 走长按保存浮层（Safari 不支持直接下载），其余浏览器直接下载 PNG
- 四维人格模型匹配 4 大学院
- Canvas 生成竖版分院卡（学院名 + 徽章 + 金句 + 3 个相似点 + 人生建议），一键下载 PNG

## 技术栈

- HTML / CSS / JavaScript（原生）
- 无任何第三方库、无构建工具、无后端

## 目录结构

```
xhs-harry-potter-test/
├── index.html          # 页面结构与四个界面
├── css/
│   └── style.css       # 样式（暗夜魔法 + 金线 + 学院专属色）
├── js/
│   ├── data.js         # 题库与学院数据（核心内容，改这里）
│   └── app.js          # 交互、计分、匹配、分院卡绘制
├── .claude/skills/     # 本产品的开发 skill（进仓库，供 Claude 复用）
└── .gitignore
```

## 本地运行

直接双击 `index.html` 在浏览器打开即可（`file://` 协议即可运行，无需服务器）。

## 部署（GitHub Pages）

1. 新建 GitHub 仓库（Public），把本目录推上去
2. 仓库 **Settings → Pages**，Source 选 `Deploy from a branch`，分支 `main`，目录 `/ (root)`
3. 得到 `https://用户名.github.io/xhs-harry-potter-test/` 的访问地址
4. 绑定自定义域名：Settings → Pages → Custom domain 填域名，再到域名服务商加 DNS 记录（子域名 CNAME 到 `用户名.github.io`，裸域加 4 条 A 记录）

## 内容数据（核心，维护看这里）

所有内容都在 [js/data.js](js/data.js)，改产品不用动其他文件。

### 解锁（unlock）

```js
unlock: {
  masterCode: "9900",              // 自己测试，不要写进自动发货
  shopCode: "FENYUAN",             // 小红书自动发货用的店铺密码
  salt: "HOGW-2026-xhs-sorting",   // 卡密库校验盐
  prefix: "HOGW",
  pageUrl: "https://chenzyishere.github.io/xhs-harry-potter-test/",
  hint: "下单后自动发货，把订单消息里的验证码填到这里",
}
```

打开链接先输验证码才能进入测试。验证通过后会在 `localStorage` 记一个标记，同一台设备不用重复输入。

**发货方式（默认）**：小红书商品后台打开「自动发货」，把 [tools/generate-codes.html](tools/generate-codes.html) 里生成的文案贴进去。所有买家收到同一条：链接 + 店铺密码 `FENYUAN`。不用人工发码。

两个商品请用不同 `shopCode`，避免买分院帽也能解开历史人物测试。密码泄露了就改 `shopCode`，同步更新自动发货文案。

**备用卡密**：如果以后改成「一单一码」，同一页可以批量生成校验码，导入卡密库。页面三种码都认：店铺密码、测试主密码、卡密。

### 四维显示名（dimensions）

```js
dimensions: [
  { pos: "勇气", neg: "谨慎" },
  { pos: "野心", neg: "淡泊" },
  { pos: "理性", neg: "感性" },
  { pos: "忠诚", neg: "自我" }
]
```

雷达图的四个轴，`pos` 是正向极（画在轴端），`neg` 是反向极（显示在下方标签里）。顺序必须与计分的四维顺序一致。

### 晒单文案（share）

```js
share: {
  template: "分院帽说：我是{persona}（{name}）🪄 {title}\n\n「{tagline}」\n\n16 道题测出你的学院人格，你也来分院？\n\n#性格测试 #人格图鉴 #内耗",
  templatePaid: "学院测试说：我是{persona}（{name}）🪄 {title}\n\n「{tagline}」\n\n16 道题测出你的学院人格，你也来试试？\n\n#性格测试 #人格图鉴 #内耗"
}
```

用户点「复制晒单文案」时复制的内容。可用占位符：`{name}` `{english}` `{title}` `{tagline}` `{advice}` `{animal}` `{founder}` `{brand}`。

### 学院（figures 数组）

```js
{
  id: "gryffindor",       // 唯一标识
  name: "格兰芬多",        // 学院中文名
  nameGeneric: "勇气学院", // 收费模式用的通用词
  english: "Gryffindor",  // 学院英文名
  persona: "勇往直前型",   // 人格标签（账号统一语汇）
  title: "勇气与胆识",     // 定调标签
  tagline: "我们纵身跃入火海，因为那里有值得守护的人",  // 金句
  seal: "勇气",           // 徽章二字
  color: "#a82723",       // 学院专属色
  vector: [0.8, 0.2, -0.3, 0.4],  // 四维坐标（-1 ~ 1）
  animal: "狮子",          // 学院动物
  founder: "戈德里克·格兰芬多",  // 创办人
  traits: ["...", "...", "..."],   // 3 个相似点
  advice: "..."            // 人生建议
}
```

### 题目（questions 数组）

```js
{
  id: "q1",
  text: "深夜的禁林传来奇怪的响动，你会？",
  options: [
    { text: "带上魔杖冲进去看个究竟", effect: [1, 0, 0, 0] },  // 选中后给四维的加分
    { text: "假装没听见，赶紧离开", effect: [-1, 0, 0, 0] }
  ]
}
```

## 四维人格模型与计分

四个维度，每题选项通过 `effect` 数组给对应维度加分（`+1` / `-1` / `0`）：

| 下标 | 维度 | 正极 | 负极 |
|---|---|---|---|
| 0 | D1 | 勇气 | 谨慎 |
| 1 | D2 | 野心 | 淡泊 |
| 2 | D3 | 理性 | 感性 |
| 3 | D4 | 忠诚 | 自我 |

计分流程：

1. 每维 4 题，得分范围 `-4 ~ +4`
2. 提交时从答案累计四维得分，除以 4 归一化到 `-1 ~ 1`
3. 与 4 个学院的 `vector` 计算**欧氏距离**，取最近者为结果

## 上线前自检

```bash
node tools/verify-reach.js
```

脚本穷举所有可达答案组合，确认 4 个学院都能被测到、分布均衡（理想各约 25%）。上线前必跑。

## 如何换题材

这套代码是「测试 H5 模板」。要换一个题材（哈利波特 → 明星 / CP / 古风 / 二次元 / 职场……），只需：

1. 改 [js/data.js](js/data.js) 的 `figures`：换掉学院/人物名、文案、`vector`
2. 改 `questions`：换题目和选项文案，`effect` 保持四维结构不变
3. 改 [index.html](index.html) 和 `data.js` 里的标题文案

计分引擎、页面、分享卡全部复用，不需要动 [js/app.js](js/app.js)。

## 合规提醒（重要）

哈利·波特 / 霍格沃茨是华纳兄弟的注册商标，商业售卖存在版权风险。把 `js/data.js` 里的 `paidMode` 改成 `true`，页面、结果卡、晒单文案会切到「魔法学院 / 勇气学院」等通用词。免费引流阶段保持 `false`。

## 后续计划

- [ ] 兑换码网关（对齐「密码 + 验证码」解锁的交付模式）
- [ ] 迁移到阿里云 OSS + CDN + 备案域名，提升国内访问速度
- [ ] 好评返利 / 复购钩子（晒图送其他工具）
