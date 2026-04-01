# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start local dev server at http://localhost:3000
npm run build      # Production build
npm start          # Start production server
```

No test framework is configured.

## Environment Setup

Copy `.env.local.example` to `.env.local` and set `REMOVE_BG_API_KEY` with a valid Remove.bg API key (get one at https://www.remove.bg/developers).

## Architecture

Single-page Next.js 14 (App Router) app. The frontend (`app/page.js`) is a single `'use client'` component managing all state (file selection, preview, result, loading, error). It POSTs a `multipart/form-data` request to `/api/remove-bg`, receives a PNG binary response, and creates an object URL for display/download.

### Dual API Backend

The project has **two parallel backend implementations** for different deployment targets:

| File | Runtime | Used when |
|------|---------|-----------|
| `app/api/remove-bg/route.js` | Node.js (Next.js API Route) | Local dev & Vercel |
| `functions/api/remove-bg.ts` | Cloudflare Workers | Cloudflare Pages |

Both implementations proxy requests to `https://api.remove.bg/v1.0/removebg` using the `REMOVE_BG_API_KEY` environment variable, and return the PNG binary directly.

The Cloudflare function (`functions/api/remove-bg.ts`) additionally accepts JSON with a base64-encoded image, while the Next.js route only accepts multipart form data.

### Key Constraints
- File size limit: 12MB (enforced in both frontend and `next.config.js`)
- Images are never stored — each request is stateless
- API key lives server-side only; frontend has no access to it
