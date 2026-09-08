# ぶおー法螺貝道場

以《偶像大师 灰姑娘女孩》中的依田芳乃为主题的非官方粉丝小游戏。对着手机麦克风轻轻吹气，与芳乃一起吹响法螺贝。

**[在线试玩](https://yoshino-buoo.github.io/buo-dojo/)** · **[问题反馈](https://github.com/yoshino-buoo/buo-dojo/issues)**

## 功能与玩法

- 日语界面，优先适配手机竖屏。
- 首页问号左侧提供默认关闭的震动开关；支持时，吹奏中随人物每次鼓起轻震，蓄力时跟随动画加速。停止、取消或离开页面时停止震动。
- 点击「法螺貝を吹く」，允许使用麦克风，等待环境音校准后开始吹气。
- 起吹后依次出现「武、謳、鶯、王」，随后从 71 个候选汉字中随机抽取，每局重新打乱顺序。
- 普通模式前 20 秒出现 30 个汉字，随后进入 5 秒蓄力阶段；单次最多 25 秒。
- 达到 25 秒后吹出最后一字「芳」，获得专属动画、字徽章与「皆伝」结算，完整一局共 31 字。提前结束则显示普通结算。
- 首页的「🐚 隠し修行モード 🐚」开关默认关闭。开启后，前 48 秒吹出 69 字，再依次蓄力 5、5、5、10 秒，分别在 53、58、63、73 秒获得「依・田・芳・乃」。73 秒集齐 73 字，获得专属对白、动画和「超・皆伝」结算与分享图印章。
- 两种模式使用相同的麦克风与长按试玩流程。中途结束保留已经获得的姓名字；重试沿用当前模式，回到首页可关闭隐藏模式，刷新页面恢复普通模式。
- 记录显示为 7.3 秒时，结算与本局分享图片会获得「依田芳乃」纪念印章。
- 吹气结束后查看汉字列表和持续时间，可再次游玩、分享到 X 或前往芳乃的官方投票页面。
- 每局生成一张 1200 × 900 的分享卡，包含完整汉字、成绩与随机人物 A／B；支持预览、保存和复制。
- 无法使用麦克风时，可选择「マイクなしでおためし」长按试玩；键盘支持空格和 Enter。

## 技术栈

使用原生 HTML、CSS 和 JavaScript，麦克风检测基于 Web Audio API。游戏本身独立运行，使用相对资源路径，可部署至 GitHub Pages 等静态托管平台。可选的访问与游戏统计使用 Cloudflare Web Analytics 和 Workers + D1；统计不可用时仍可正常游玩。

开发与测试使用 Node.js、Node.js Test Runner 和 Playwright。

## 快速开始

需要 Node.js 20 或以上版本，以及 npm。持续集成使用 Node.js 22。

```sh
git clone https://github.com/yoshino-buoo/buo-dojo.git
cd buo-dojo
npm ci
npm run dev
```

在浏览器中打开 [http://localhost:4173](http://localhost:4173)。

麦克风需要 HTTPS 或 localhost 环境。手机访问局域网 HTTP 地址时，可使用长按试玩模式。请通过开发服务器访问页面，避免直接以 `file://` 打开 HTML。

## 开发命令

| 命令                  | 用途                            |
| --------------------- | ------------------------------- |
| `npm run dev`         | 启动开发服务器，默认端口为 4173 |
| `npm run check`       | 检查 JavaScript 语法            |
| `npm test`            | 运行游戏逻辑与交互测试          |
| `npm run test:layout` | 运行浏览器布局测试              |
| `npm run build`       | 将网站与资源打包至 `dist/`      |

运行布局测试前，安装测试所需的浏览器：

```sh
npx playwright install chromium
npm run test:layout
```

Linux 环境可使用 `npx playwright install --with-deps chromium` 安装浏览器及系统依赖。macOS 已安装 Chrome 时，测试配置会优先使用系统 Chrome。

测试覆盖吹气检测、计时、汉字随机序列、分享、麦克风资源释放，以及不同屏幕尺寸和可用高度下的布局。麦克风的实际表现仍需在手机上验证。

## 项目结构

```text
.
├── index.html                 # 页面结构与日语文案
├── styles.css                 # 样式、响应式布局和动画
├── app.js                     # 游戏交互、麦克风生命周期与分享
├── breath.js                  # 吹气检测与汉字序列
├── haptics.js                 # 与吹奏动画同步的轻震反馈
├── analytics.js               # 正式站点的访问、结算与投票点击统计
├── analytics-worker/          # Cloudflare 统计接口、数据库结构和查看说明
├── config.js                  # 游戏配置
├── share.js                   # X 分享、图片保存与复制
├── share-card.js              # Canvas 绘制本次成绩分享卡
├── assets/                    # 人物、标题图片与游戏汉字字体
├── scripts/                   # 开发服务器、构建与素材处理脚本
├── tests/                     # 逻辑、交互与浏览器布局测试
└── .github/workflows/pages.yml # GitHub Pages 自动部署
```

## 配置

访问量、普通/隐藏模式结算、成绩与投票入口点击的统计配置和查看方式见 [统计说明](analytics-worker/README.md)。

主要设置位于 [`config.js`](config.js)：

| 配置项                | 默认值                                                                                                 | 说明                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `voteUrl`             | [依田芳乃官方投票页](https://idolmaster-official.jp/cinderellagirls/vote2026/vote/idol/yorita_yoshino) | 投票按钮的跳转地址，设为空字符串可关闭入口 |
| `shareHashtags`       | `ぶおー法螺貝道場`、`依田芳乃`、`シンデレラガール総選挙2026`                                           | 分享结果使用的话题标签                     |
| `regularGlyphCount`   | `30`                                                                                                   | 蓄力前出现的汉字总数，包含固定开头四字     |
| `regularPhaseSeconds` | `20`                                                                                                   | 普通出字阶段的时长，单位为秒               |
| `maxBlowSeconds`      | `25`                                                                                                   | 单次游戏的最长持续时间，单位为秒           |
| `finalKanji`          | `芳`                                                                                                   | 达到时间上限后出现的奖励字                 |

隐藏模式在 `config.js` 的 `TRAINING_CONFIG` 中配置，普通模式仍使用 `CONFIG`。`chargeStages` 定义每段的奖励字与蓄力秒数；调整课程时应使阶段秒数之和加上 `regularPhaseSeconds` 等于 `maxBlowSeconds`，并让 `finalKanji` 与各阶段奖励字一致。

候选汉字位于 [`breath.js`](breath.js) 的 `O_KANJI` 中，两种模式共用。开头四字是固定的趣味序列；后续候选具有「お／オ／オウ」读音，包括部分生僻字、旧字形和表外读音，如桜、旺、皇、凰、鴨、鷹。奖励字「依・田・芳・乃」独立于普通字池。当前字库足够两个模式每局不重复；将来增加字数时，抽完一轮才重新洗牌，且轮次交界不会连出同一字。读音参考[漢字ペディア](https://www.kanjipedia.jp/sakuin/onkun/%E3%82%AA)与[漢字辞典音训索引](https://kanjitisiki.com/yomi-sakuin/05.html)。

字库按主要字义与游戏氛围筛选中性或积极的候选，例如[咊（和睦）](https://kanjitisiki.com/jis4/0046.html)、[箊（竹名）](https://kanjitisiki.com/kanji1/6700.html)、[鴮（鹈鹕）](https://kanjitisiki.com/kanji1/11424.html)。扩充时应同时核对读音与释义，避免污秽、病痛、悲叹、厌倦等消极联想。

游戏汉字使用随站点提供的精简明朝体字体，避免生僻字在不同设备上回退到其他字形。修改候选池或奖励字后，需按 [字体说明](assets/fonts/README.md) 重新生成字体子集并运行字体覆盖测试。

## X 分享

点击结算框中的「Xにシェア」，投稿文自动填入本局字数、用时、话题标签与游戏链接。X 网页投稿的链接预览图固定为「武・謳・鶯・王」和人物 A，不需要先保存图片。

- 支持文件分享的手机可通过系统分享菜单选择 X，将图片与投稿文一起交给 X 应用。
- 其他环境直接打开预填文本的 X 投稿页，由 X 抓取固定的链接预览图。
- 「結果画像を見る」可预览本局完整分享卡，使用实际汉字顺序、成绩与随机人物 A／B；同一局重复打开或保存时保持同一张图。提供单独保存图片、复制投稿文及受支持环境下的复制图片入口。
- 图片在浏览器内绘制，等待字体和素材加载后才导出 PNG。图片生成失败时可以重试，也可以继续分享链接与文字。

[X 网页投稿入口](https://docs.x.com/x-for-websites/post-button/overview)支持预填文本和链接，链接可显示预览卡片。`index.html` 的 Open Graph 与 Twitter Card 标签指向随站点部署的 `assets/link-preview.png`；复制部署到其他地址时，应同时修改这些绝对 URL。固定预览图复用 `share-card.js` 的卡片样式：启动开发服务器后执行 `npm run build:preview` 可重新导出，无需在部署时运行浏览器。卡片不印制站点地址，方便迁移时继续使用。X 可能缓存预览，更新图片后不一定立即刷新。

每局完整结果图作为可选的图片附件使用。系统分享目标由设备及已安装应用提供，参见 [Web Share API](https://www.w3.org/TR/web-share/)。

网站不上传成绩图片，不需要 X API 密钥，也不会代替玩家发布帖子。

## 部署

仓库已配置 GitHub Actions 自动部署至 GitHub Pages。复用本项目时：

1. 在仓库 **Settings → Pages** 中，将 **Source** 设置为 **GitHub Actions**。
2. 推送代码至 `main`，或在 **Actions** 中手动运行 **Deploy to GitHub Pages**。
3. 工作流将依次运行检查、测试与构建，并发布 `dist/` 中的内容。

其他静态托管平台可直接发布 `npm run build` 生成的 `dist/` 目录。请保留资源文件名的大小写，并启用 HTTPS 以使用麦克风。

相关文档：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 麦克风与隐私

音频仅在浏览器内实时分析，不录制、保存或上传。结束游戏、取消操作或将页面切换到后台时，会释放麦克风资源。

震动开关仅在当前页面内保留选择，刷新后默认关闭。不支持 Vibration API 的浏览器会显示不可用状态。目前主要由 Chromium 系浏览器支持，Safari 和 iPhone 版 Chrome 不提供此接口；原生开关的触觉反馈不等于支持游戏的自动节拍震动。网页只能设置震动时长，实际触感取决于硬件和系统设置，参见 [Vibration API 规范](https://www.w3.org/TR/vibration/)。每次只请求 10 毫秒的短震，不会补发页面卡顿期间错过的节拍。

吹气检测基于音量和频谱特征，可能受环境噪声、手机麦克风和浏览器音频处理影响。可通过「マイク感度」滑块调整灵敏度；无法使用麦克风时，可切换到长按试玩模式。

## 贡献

欢迎通过 [Issues](https://github.com/yoshino-buoo/buo-dojo/issues) 反馈问题或提出建议，也欢迎提交 Pull Request。

报告兼容性问题时，请提供设备型号、操作系统和浏览器版本、复现步骤及预期行为。涉及界面的修改，请附上手机竖屏效果截图，并在提交前运行相关检查与测试。

## 许可与版权

本仓库暂未指定开源许可证。人物、名称、标识及相关图像素材的权利归各自权利人所有。

随附的 Dojo Kanji 字体子集基于 Noto Serif CJK JP，按 [SIL Open Font License 1.1](assets/fonts/OFL.txt) 分发；来源与修改说明见 [字体说明](assets/fonts/README.md)。此许可证仅适用于该字体。

このサイトはバンダイナムコエンターテインメント株式会社および各関連企業・団体とは一切関係ありません。

THE IDOLM@STER™ & ©Bandai Namco Entertainment Inc.
