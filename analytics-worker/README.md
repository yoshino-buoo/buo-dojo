# Analytics

网站继续由 GitHub Pages 托管。Cloudflare Web Analytics 统计访问量；一个 Cloudflare Worker 将结算和投票入口点击写入 D1。统计失败不会阻塞游戏，也不会阻塞投票跳转。

## 统计口径

- **访问量**：在 Cloudflare 的 **Web Analytics** 中查看。仅页面访问计入，不把结算伪装成页面访问。
- **结算量**：每局产生最终成绩时计一次。打开分享图、返回结果、切换到后台不会重复计算已结算的同一局。
- **模式**：`normal` 是普通模式，`training` 是隐藏模式。
- **游玩方式**：`microphone` 是麦克风，`demo` 是「おためし」，可分开查看，避免混淆实际吹气成绩。
- **成绩**：秒数与页面一样向下保留一位小数，记录文字数量以及是否完成整个挑战。不保存音频、汉字列表、玩家姓名或持久访客标识。
- **投票入口点击**：每次激活投票链接计一次，包括键盘和鼠标中键；它不代表实际完成投票。
- **日期**：D1 的原始时间为 UTC，汇总和成绩视图使用日本时间 JST。

## 查看数据

在 Cloudflare **Storage & databases → D1 → buo-dojo-stats** 打开 **Explore Data**，选择对应视图；也可在 **Console** 运行以下查询：

```sql
-- 两种模式、两种游玩方式的结算次数、通关次数、平均/最长成绩、投票点击
SELECT * FROM summary;

-- 每天的结算和投票情况
SELECT * FROM daily_summary;

-- 最近 100 次结算的时间、模式、秒数和文字数
SELECT * FROM round_results LIMIT 100;
```

`results` 是结算次数，`full_completions` 是通关次数，`vote_clicks` 是投票入口点击次数。原始数据位于 `game_events` 表。

## 部署

1. 在 Cloudflare 免费方案中创建名为 `buo-dojo-stats` 的 D1 数据库，执行 [`schema.sql`](schema.sql)。
2. 创建 Worker，部署 [`worker.js`](worker.js)，添加名称为 `DB` 的 D1 绑定，指向该数据库。
3. 将 Worker 的 HTTPS `/events` 地址填入 [`config.js`](../config.js) 的 `ANALYTICS.eventsUrl`。
4. `ANALYTICS.hostname` 和 `beaconToken` 配置 Web Analytics 站点。迁移域名时同时修改 Worker 允许的来源。

前端只有在配置的正式 HTTPS 域名下才加载统计；本地开发、其他域名及通常的自动化测试不会产生正式数据。Web Analytics token 是公开站点标识，不是账号 API 密钥。不要把 Cloudflare 账号凭据放入本仓库。

Worker 仅提供写入接口，数据查看依赖 Cloudflare 账号权限。服务端仅保留规定字段，用参数化 SQL 写入，并以事件 ID 去重。浏览器公开接口无法证明数据来自真人；广告拦截、网络中断也可能漏报，因此这些数据用于观察趋势，不用于比赛排名或奖励发放。
