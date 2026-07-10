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

## 快速開始

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 環境變數

```bash
cp .env.example .env
# 預設連本機 Docker Postgres；或改為 Neon / Render 連線字串
```

```bash
# apps/web/.env — 開發時可留空，走 Vite proxy
VITE_API_URL=
VITE_SOCKET_URL=
```

### 3. 資料庫

```bash
# 需要 Docker
docker compose up -d

pnpm db:generate
pnpm db:push
```

沒有 Docker 時可改用 [Neon.tech](https://neon.tech) free Postgres，把 `DATABASE_URL` 貼進 `.env`。

### 4. 開發

```bash
# Terminal 1 — API + Socket
pnpm dev:server

# Terminal 2 — Web
pnpm dev:web
```

- Web: http://localhost:5173  
- API: http://localhost:3000  
- Health: http://localhost:3000/health  

### 5. 驗證流程

1. 首頁 →「快速建立賽事」→ 填名稱 + Host PIN  
2. 主辦登入（同一 PIN）→ 新增 / 編輯 / 刪除玩家  
3. 複製分享連結 → `/watch/:shareCode` 觀眾模式  
4. Socket room：`tournament:{id}` 同步玩家變更

## Phase 1 進度

- [x] pnpm monorepo 骨架
- [x] Prisma schema（完整）
- [x] Fastify server 基本結構
- [x] Socket.io 房間（join_tournament）
- [x] Tournament CRUD API
- [x] Player CRUD API
- [x] 前端：首頁 / 建立 / 主控台（玩家管理）
- [ ] brackets-manager 單敗 / 循環
- [ ] 全螢幕計分板 + Undo
- [ ] 觀眾模式 + QR
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

## License

Private / TBD
