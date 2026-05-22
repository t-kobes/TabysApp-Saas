# B2B TG

NestJS backend for the B2B TG bot.

## Overview

This repository contains a Telegram bot backend built with NestJS.

Key features:
- Telegram bot integration using `nestjs-telegraf`
- Supabase client support for storage and authentication
- AI-powered features using Google Generative AI
- Calculator wizard flow for guided user interactions
- User token management and custom business logic

## Project structure

- `src/main.ts` — application bootstrap
- `src/app.module.ts` — main module wiring
- `src/telegram` — Telegram bot updates and wizard scenes
- `src/supabase` — Supabase provider and client service
- `src/ai` — AI service integration
- `src/calculator` — calculation logic and DTOs
- `src/users` — user service and token handling

## Requirements

- Node.js 20+ (recommended)
- npm
- Nest CLI (optional)

## Setup

```bash
npm install
```

Create `.env` with the required environment variables, for example:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key
GOOGLE_API_KEY=your_google_api_key
```

## Run

```bash
npm run start:dev
```

## Production build

```bash
npm run build
npm run start:prod
```

## Scripts

- `npm run start` — start application
- `npm run start:dev` — start in watch mode
- `npm run start:prod` — run the built app
- `npm run lint` — run ESLint
- `npm run format` — format source files with Prettier
- `npm run test` — run Jest tests
- `npm run test:e2e` — run end-to-end tests
- `npm run test:cov` — generate coverage report

## Notes

- `dist/` is excluded by `.gitignore`
- Keep secrets out of Git by using `.env`
- If you use Supabase, make sure the service role key is stored securely

## License

This project is private.
