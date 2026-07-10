# BeybladeX Tournament Manager（陀螺賽事通）

專業爆旋陀螺比賽管理 Web App — 手機優先、裁判為主、4 分制 + 即時同步。

## 技術棧

| Layer | Stack |
|-------|--------|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS + TanStack Query + Zustand + Socket.io-client |
| Backend | Node.js 22 + Fastify + Socket.io + Prisma + Zod |
| DB | PostgreSQL |
| Monorepo | pnpm workspaces |

## 目錄結構

```
beyblade-tournament/
├── apps/
│   ├── web/          # Vite React Frontend
│   └── server/       # Fastify Backend
├── packages/
│   └── shared/       # 共用 types, zod schemas, constants
├── prisma/
│   └── schema.prisma
├── pnpm-workspace.yaml
└── package.json
```

## 快速開始（Quick Start）

### 前置需求

- **Node.js** ≥ 22  
- **pnpm** ≥ 9（`npm install -g pnpm`）  
- **PostgreSQL** 本機或雲端（見下方）

### 一鍵指令摘要

```bash
# 1. 取得專案
git clone https://github.com/Takjai18/beyblade-tournament.git
cd beyblade-tournament

# 2. 安裝依賴
pnpm install

# 3. 環境變數
cp .env.example .env
# 編輯 .env，設定 DATABASE_URL（見下方「資料庫」）

# 4. 產生 Prisma Client + 同步資料表
pnpm db:generate
pnpm db:push

# 5. 開兩個 terminal 啟動
pnpm dev:server   # API + Socket → http://localhost:3000
pnpm dev:web      # 前端       → http://localhost:5173
```

瀏覽器開啟：**http://localhost:5173**

| 服務 | 網址 |
|------|------|
| 前端 Web | http://localhost:5173 |
| API | http://localhost:3000 |
| Health check | http://localhost:3000/health |

---

### 資料庫設定

#### 方案 A：Homebrew PostgreSQL（macOS 推薦）

```bash
# 安裝並啟動
brew install postgresql@16
brew services start postgresql@16

# 把 CLI 加入 PATH（可寫進 ~/.zshrc）
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# 建立資料庫
createdb beyblade_tournament
```

`.env` 範例（本機 trust auth，使用者為你的 macOS 帳號）：

```env
DATABASE_URL="postgresql://YOUR_MAC_USERNAME@localhost:5432/beyblade_tournament?schema=public"
JWT_SECRET="dev-secret-change-me"
PORT=3000
CORS_ORIGIN="http://localhost:5173"
HOST=0.0.0.0
```

#### 方案 B：Docker Compose

```bash
docker compose up -d
```

`.env`：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/beyblade_tournament?schema=public"
```

#### 方案 C：Neon / Render 等雲端 Postgres

把供應商提供的連線字串貼進 `.env` 的 `DATABASE_URL` 即可。

---

### 前端環境變數（可選）

```bash
cp apps/web/.env.example apps/web/.env
```

開發時可**留空** `VITE_API_URL` / `VITE_SOCKET_URL`，會走 Vite proxy 轉到 `:3000`。

```env
# apps/web/.env
VITE_API_URL=
VITE_SOCKET_URL=
```

---

### 日常開發指令

```bash
cd beyblade-tournament

# 啟動 API（Terminal 1）
pnpm dev:server

# 啟動 Web（Terminal 2）
pnpm dev:web

# 資料庫
pnpm db:generate   # 產生 Prisma Client
pnpm db:push       # 同步 schema 到 DB
pnpm db:studio     # Prisma Studio GUI

# 建置
pnpm build
```

若出現 `ERR_CONNECTION_REFUSED`，代表 dev server 沒在跑，重新執行 `pnpm dev:server` 與 `pnpm dev:web`。

---

### 驗證流程

1. 開啟 http://localhost:5173  
2. 「快速建立賽事」→ 填名稱 + Host PIN（4–6 位）  
3. 主辦登入（同一 PIN）→ 新增至少 2 位玩家  
4. 「產生對戰表」→ 點對戰進入全螢幕計分板  
5. Spin / Over / Burst / Xtreme 計分；Undo 撤銷；達 `pointsToWin` 自動完結  
6. 分享 `/watch/:shareCode` 觀眾模式  

## Phase 1 進度

- [x] pnpm monorepo 骨架
- [x] Prisma schema（完整）
- [x] Fastify server 基本結構
- [x] Socket.io 房間（join_tournament）
- [x] Tournament CRUD API
- [x] Player CRUD API
- [x] 前端：首頁 / 建立 / 主控台（玩家管理）
- [x] 單敗 / 循環對戰表產生（內建 bracket engine）
- [x] 全螢幕計分板 + finishes + ActionLog + Undo
- [x] 達 `pointsToWin` 自動完結 + 單敗晉級 + 排名更新
- [x] Socket `match_updated` / `standings_updated` 即時同步
- [ ] 觀眾模式 QR Code 精修
- [ ] PWA + i18n 完整

## API 摘要

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/tournaments` | 列表 |
| POST | `/api/tournaments` | 建立 |
| GET | `/api/tournaments/:slug` | 詳情 |
| PATCH | `/api/tournaments/:id` | 更新 |
| DELETE | `/api/tournaments/:id` | 刪除 |
| POST | `/api/tournaments/:id/players` | 新增玩家 |
| PATCH | `/api/players/:id` | 更新玩家 |
| DELETE | `/api/players/:id` | 刪除玩家 |
| POST | `/api/tournaments/:id/join-referee` | PIN 驗證 |
| GET | `/api/tournaments/:id/standings` | 排名 |
| GET | `/api/watch/:shareCode` | 觀眾用 shareCode |
| POST | `/api/tournaments/:id/generate` | 產生對戰表 |
| GET | `/api/tournaments/:id/matches` | 對戰列表 |
| GET | `/api/matches/:id` | 單場詳情 |
| POST | `/api/matches/:id/start` | 開始 |
| POST | `/api/matches/:id/score` | 計分 `{ type, playerId }` |
| POST | `/api/matches/:id/undo` | 撤銷最近一筆 |
| POST | `/api/matches/:id/complete` | 手動結束 |
| GET | `/api/matches/:id/actions` | ActionLog（最近 20） |

## License

Private / TBD
