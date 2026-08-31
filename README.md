# TABYSAPP

## Telegram bot backend for business support and guided calculations

This repository implements a NestJS backend for a Telegram bot designed to support B2B workflows. It combines conversational wizard state, calculation logic, Supabase persistence, and AI-assisted actions through Google Generative AI.

The implementation is backend-only. The bot is managed through Telegram updates. It runs as a single Node.js service by default, and scales horizontally to multiple replicas once Redis-backed sessions and webhook mode are enabled (see [Scaling to multiple instances](#scaling-to-multiple-instances)).

---

## Architecture

The application is built as a modular NestJS service with the following major layers:

- `src/main.ts`
  - bootstraps the Nest application and loads the dependency graph.
- `src/app.module.ts`
  - registers and configures feature modules, including Telegram, Supabase, AI, calculator, and user services.
- `src/telegram`
  - contains Telegram integration, update handling, and wizard scene definitions for guided flows.
- `src/supabase`
  - encapsulates Supabase client initialization and storage access.
- `src/ai`
  - wraps Google Generative AI calls and any AI-specific orchestration.
- `src/calculator`
  - implements domain-specific calculation logic, DTO validation, and response construction.
- `src/users`
  - manages user state, token accounting, and business rules around request quotas or authorization.

---

## Key functional areas

- Telegram bot integration via `nestjs-telegraf`
- Wizard-style user interaction flows for structured B2B processes
- Supabase as persistent storage and user state backend
- AI integration for enhanced conversational or decision support
- Domain calculator service for business-specific calculations
- User token and quota management for controlling access

---

## Technology stack

- Node.js 20+
- TypeScript
- NestJS 11
- `nestjs-telegraf` + `telegraf` for Telegram bot handling
- Supabase JavaScript client (`@supabase/supabase-js`)
- Google Generative AI SDK (`@google/generative-ai`)
- Jest for tests
- ESLint + Prettier for code quality

---

## Environment variables

The service depends on runtime secrets and external service configuration. Typical environment variables include:

- `TELEGRAM_BOT_TOKEN`
  - Telegram bot token used by `nestjs-telegraf`
- `SUPABASE_URL`
  - Supabase project URL
- `SUPABASE_KEY`
  - Supabase service role or API key with the required access
- `GOOGLE_API_KEY`
  - API key for Google Generative AI requests
- `REDIS_URL`
  - ioredis connection string. When set, Telegram sessions are stored in Redis (required to run more than one instance). When unset, sessions stay in memory.
- `WEBHOOK_DOMAIN`
  - Public HTTPS base URL (e.g. `https://your-app.up.railway.app`). When set, the bot runs in webhook mode; when unset, it falls back to long-polling.
- `WEBHOOK_SECRET`
  - Optional secret token sent in the `X-Telegram-Bot-Api-Secret-Token` header to verify webhook requests.

> Keep all secrets in `.env` or the hosting platform's secret store. Do not commit credentials to Git.

### Scaling to multiple instances

The service is stateless once sessions live in Redis. To run more than one replica, set **both** `REDIS_URL` (shared session state) and `WEBHOOK_DOMAIN` (webhook mode). Long-polling permits only one consumer of `getUpdates`, so multiple polling instances would collide with `409 Conflict`. The `GET /` health endpoint (`Bot is alive!`) can back the load balancer's health check.

---

## Local setup

```bash
npm install
```

Create a `.env` file in the repository root with the required values.

Start in development mode:

```bash
npm run start:dev
```

For production-ready execution:

```bash
npm run build
npm run start:prod
```

---

## Deployment considerations

- Ensure outbound network access to Telegram API and Google API endpoints.
- Validate DNS resolution for `api.telegram.org` and Google service domains.
- Use a secure secret store for `SUPABASE_KEY`, `TELEGRAM_BOT_TOKEN`, and `GOOGLE_API_KEY`.
- Deploy the service with a process manager or container orchestrator that restarts on failure.

---

## Module responsibilities

- `TelegramModule`
  - initializes the Telegram bot adapter, registers update handlers, and dispatches incoming messages to wizard scenes.
- `SupabaseModule`
  - initializes the Supabase client and exposes a service for persistence operations.
- `AiModule`
  - centralizes AI request logic and manages generative model calls.
- `CalculatorModule`
  - validates input data and computes business-specific results.
- `UsersModule`
  - tracks user context, token balances, and any access rules.

---

## Scripts

- `npm run start` — start the Nest application
- `npm run start:dev` — development mode with file watching
- `npm run start:prod` — run compiled production build
- `npm run build` — compile TypeScript into `dist/`
- `npm run lint` — run lint checks and auto-fix
- `npm run format` — format source code with Prettier
- `npm run test` — unit/integration tests via Jest
- `npm run test:e2e` — end-to-end tests
- `npm run test:cov` — coverage report

---

## Operational notes

- The bot is intentionally designed as a Telegram backend and does not include a web UI.
- The service is stateful in the sense that it maintains user session progress through wizard scenes.
- Any integration errors during startup usually indicate missing environment variables or network connectivity issues.
- If DNS resolution fails for Telegram, verify host network settings and proxy/firewall configuration.

---

## License

This repository is private and not intended for public distribution.
