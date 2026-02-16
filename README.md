# 🌳 Metatree

**Track the Runner. Find the Branches.**

Solana analytics platform for tracking Pump.fun launches, migrated runners, and narrative clusters.

## Features

- 🏃 **Main Runners** - Track tokens with $500k+ market cap
- 🔥 **Hot Metas** - Auto-detected narrative clusters  
- 🌱 **New Branches** - Fresh tokens passing volume threshold
- 📊 **Live Updates** - Auto-refresh every 15 seconds

## Deploy to Vercel

1. Fork this repo
2. Connect to Vercel
3. Add Vercel Postgres (Storage tab)
4. Deploy!

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (auto-set by Vercel Postgres)
- `CRON_SECRET` - Optional secret for /api/sync endpoint

## API Endpoints

- `GET /api/dashboard` - Main dashboard data
- `GET /api/sync` - Sync token data from DexScreener
- `POST /api/tokens` - Add a new token to track
- `GET /api/tokens` - List all tokens

## Add Tokens

```bash
curl -X POST https://your-app.vercel.app/api/tokens \
  -H "Content-Type: application/json" \
  -d '{"mint": "TOKEN_MINT_ADDRESS", "symbol": "SYMBOL", "name": "Token Name"}'
```

## Tech Stack

- Next.js 14 (App Router)
- Prisma + PostgreSQL
- TailwindCSS
- Framer Motion
- DexScreener API
