# SOFA Graph Monitor Plan
文档不够完整

## Server
### 参考thegraph.js 写node服务，生成或更新subgraphs_delay.json
  - 将apikey和各rpc作为环境变量放在.env中，主程序可以引用
  - 用node-cron每60分钟(暂定)跑一次定时任务，获取所有11个subgraph的delay信息，并记录更新到本地subgraphs_delay.json文件。单个subgraph的delay获取可以参考getSubgraphDelay函数。
  - subgraphs_delay.json的数据结构参考
    {
      "vault_eth": {
        "gateway": [{timestamp: 1764641772, delay: 12}, ...],
        "goldsky": [{timestamp: 1764641772, delay: 12}, ...],
        "indexers": {
          "0xC36442b4a4522E871399CD717aBDD847Ab11FE88": [{timestamp: 1764641772, delay: 12}, ...],
          ...
        }
      }
      ...
    }
    - 上面的timestamp单位是秒，每次更新的所有subgraph的delay有相同的timestamp。
    - 新的timestamp和delay数据加到数组尾部，数组最多保留168(暂定)组数据，最早的数据被删除。
    - 若获取delay时有error，则delay字段存error的具体信息字符串。
    - 若subgraphs_delay.json中的某个subgraph的indexer已经不在这个subgraph的indexers（函数getSubgraphDelay的变量）中，则在文件中删除。
### 需要为前端展示提供服务接口，获取subgraphs_delay.json的内容
  - 提供 GET /api/delays：读取 server/subgraphs_delay.json 原样返回 JSON。
  - 头部：Content-Type: application/json；Cache-Control: no-store；前端跨域，加 Access-Control-Allow-Origin: *。
  - 健康检查：GET /health 返回 200 和 {status:"ok"}。
  - 运行方式：沿用现有 node 进程，定时任务和 HTTP 接口共存；使用 express。
### 本地运行
  - cd server && npm start

## Client
### 目标
- 以纯静态页面方式展示延迟历史，便于托管到任意静态站点（GitHub Pages / Cloudflare Pages / S3+CloudFront 等），只依赖后端提供的 `/api/delays`。
- 代码放在frontend目录下
- 需要在电脑和手机上都可以正常显示

### 技术栈（简洁通用）
- 单页静态应用，无打包依赖也可工作： `index.html` + `main.js` + `style.css`。
- 使用浏览器原生 `fetch` 获取数据，绘图选用 `Chart.js`（体积小、默认样式够用、易托管），无框架依赖。

### 数据约定
- 直接消费 `GET /api/delays` 返回的 JSON，不做额外转换；前端仅校验字段存在并回退为 “N/A”。
- 时间轴以服务器返回的 `timestamp`（秒）为准，前端使用浏览器本地时区格式化
- 暂定显示最近 7 天（168 条）的数据；若数据不足，用空柱占位，不阻塞渲染。

### 交互与可视化
- 单列主内容，不需要侧栏
- 页面从上到下依次展示所有11个subgraphs的delay柱状图组。subgraphs的顺序从上到下是: 
    vault_eth, vault_arb, vault_bsc, vault_pol, vault_sei, automator_eth, automator_arb, automator_sei, vault_sep, vault_arbsep, automator_arbsep
- 对于每个subgraph的delay柱状图组，gateway 与 goldsky 各占一整行宽度（100% 内容宽），按“gateway 行在上、goldsky 行在下”的顺序；如果没有 gateway，就只渲染 goldsky 行。gateway 行下面紧跟一个折叠面板，点击可展开每个 indexer 的 delay 柱状图
- delay柱状图：
  - 横向是时间，占满整个页面的宽度，第一个柱子在最左边，显示最近时间的delay值；往右依次显示历史的delay值。留出168个柱子的位置，即使没有168条数据
  - 柱体自下向上绘制，底部与时间轴对齐（bottom-align），以便直观比较高度；空槽位保持零高度占位
  - delay单位是block，delay越大柱越长，但不用等比例，防止有的值很大，小的柱子会显示不出来。error用红色柱子，高度为最高柱子的一半；delay值大于等于阈值，柱子显示橙色；delay值小于阈值，柱子显示绿色
  每个subgraph的阈值如下：
  { vault_eth: 11, 
    vault_arb: 360, 
    vault_bsc: 11,
    vault_pol: 60,
    vault_sei: 540,
    automator_eth: 6,
    automator_arb: 180
    automator_sei: 270
    vault_sep: 22,
    vault_arbsep: 720,
    automator_arbsep: 360
  }
  - 鼠标悬停于柱子或柱子上方，显示该根柱对应的时间戳的本地时间，延迟值或error信息。
- 自动刷新：默认每 20 分钟（暂定）轮询一次。

### 部署与运行
- CORS：后端已加 `Access-Control-Allow-Origin: *`，前端无需额外代理；若同域部署则直接相对路径 `/api/delays`。

服务端启动：
  TS_IP=$(tailscale ip -4 | head -n1)
  HOST="${TS_IP}" PORT=4101 nohup npm run start > app.log 2>&1 & 挂起跑，退出服务器不会停止
  # 使用 PM2 管理
  pm2 start /bin/bash --name my-service -- -lc "TS_IP=$(tailscale ip -4 | head -n1); HOST=${TS_IP} PORT=4101 node server.js"
  pm2 save
node: 
  const host = process.env.HOST || "0.0.0.0";
  const port = process.env.PORT || 3000;
  app.listen(port, host, () => {
    console.log(`Listening on http://${host}:${port}`);
  });
  app.get("/api/delays", ...);


## test
- cd server && npm start
- npx serve frontend -l 3001
  临时去执行叫做 serve 的那个 npm 包提供的命令
  把某个目录frontend当成静态网站跑起来
  监听 3001 端口。http://localhost:3001
- 在浏览器中 http://localhost:3001/?api=http://localhost:3000
- 修改subgraphs_delay.json用来测试，让每个subgraph中的gateway，goldsky和多个indexer都有168个时间戳及delay数据。注意在数组中，越晚的数据越靠后，最晚的时间戳不晚于现在。

