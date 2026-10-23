# Torob Check

Next.js monorepo for the Torob in-person shopping assistant challenge.

## Local setup

Requirements: Node.js 22.12+, pnpm 11, and Docker Desktop running.

Copy the environment examples, then start and migrate PostgreSQL:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:import
pnpm dev
```

`db:import` loads the CSV files in `dataset/` into an empty local database. It is a one-time import; rerunning it will hit the existing primary keys. The map uses OpenFreeMap with MapLibre and needs no API key. Set `BETTER_AUTH_SECRET`, `MERCHANT_ADMIN_EMAILS`, `SMTP_URL`, and `SMTP_FROM` in `apps/web/.env.local`, and set the same generated `SETTINGS_ENCRYPTION_KEY` in both environment files before creating the first administrator account. After that, configure AI providers, Tavily, Instagram, and SMTP from `/admin/settings`; saved secrets are encrypted in PostgreSQL. Environment provider keys are optional fallbacks.

Run the scheduled public source refresh worker separately with `pnpm worker:dev`, or start it with Docker using `docker compose --profile worker up --build`. The worker refreshes admin-approved websites through Tavily and authorized professional Instagram public media once per day. Public findings remain unverified and never update stock or price facts.

Shopper conversations stay in the browser session. Contact actions open a call or Instagram/WhatsApp draft for the shopper to send. Instagram API access is limited to authorized professional profiles and public media in this release; it does not automate merchant DMs.

The merchant portal at `/merchant` is optional and intended as a last resort for a shop that wants to maintain verified information directly. Merchants must verify email, and a site administrator approves shop claims and requested public sources first. Admin review queues and integrations live at `/admin/review` and `/admin/settings`.

The project MCP configuration includes the official shadcn registry server and Next.js devtools server. Restart Codex after adding MCP servers to its user configuration.

## Shared UI components

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button";
```
