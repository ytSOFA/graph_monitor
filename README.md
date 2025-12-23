# Graph Monitor

## 功能
- 定时拉取各 subgraph 的延迟信息并写入 `server/subgraphs_delay.json`
- 提供 API：`GET /api/delays` 与 `GET /api/health`
- 纯静态前端可视化延迟历史（Chart.js，自动刷新）

## 使用
1) 准备环境变量  
   - 复制 `server/.env.example` 为 `server/.env`  
   - 配置 `GRAPH_API_KEY1` / `GRAPH_API_KEY2`（可填同一个）及各链 `RPC_*`
2) 启动后端  
   - `cd server && npm install`  
   - `npm start`（定时任务 + API）  
   - 仅执行一次：`npm run once`
3) 打开前端  
   - 使用任意静态服务器托管 `frontend/`  
   - 如需指定 API 地址：`?api=http://localhost:3000`

## 部署
- 后端作为常驻进程运行（例如 pm2/systemd），保证 `server/subgraphs_delay.json` 持久化
- 前端部署为静态站点
- 通过反向代理将 `/api/*` 转发到后端服务（其余路径指向静态站点）
