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

`db:import` loads the CSV files in `dataset/` into an empty local database. It is a one-time import; rerunning it will hit the existing primary keys. The map uses OpenFreeMap with MapLibre and needs no API key. Set `BETTER_AUTH_SECRET` in `apps/web/.env.local`; `SYSTEM_ADMIN_EMAILS` is optional, and when no bootstrap admin exists the first signup becomes the system administrator. SMTP and Resend settings are also optional for the first admin, who can sign in and configure email delivery later from `/admin/settings`. Merchant accounts still need a verified email before they can manage a shop. `SYSTEM_ADMIN_EMAILS` controls platform-wide review and settings access; it is separate from verified shop memberships granted after claim approval. Set the same `SETTINGS_ENCRYPTION_KEY` in both environment files when you start saving secret provider credentials. After that, configure AI providers, Tavily, Instagram, and email delivery from `/admin/settings`; saved secrets are encrypted in PostgreSQL. Environment provider keys are optional fallbacks. Existing deployments can continue using `MERCHANT_ADMIN_EMAILS` as a legacy alias until they migrate.

Run the public source refresh worker separately with `pnpm worker:dev`, or start it with Docker using `docker compose --profile worker up --build`. The worker refreshes approved websites and authorized professional Instagram public media daily, and processes on-demand Tavily research jobs from the assistant. Chat receives cached findings and a queued status immediately; it does not wait for external research. Public findings are stored only as attributed, unverified research observations. On-demand research stores extracted source text only; it skips search summaries, empty extracts, and extraction failures (which are retried). No LLM extracts or writes prices, stock, opening hours, or contacts. Only fresh, field-specific merchant-confirmed observations can populate those current facts; when evidence is missing, expired, or ambiguous, the assistant reports the value as unknown. On-demand queue entries retain only the bounded shop question and are deleted after one hour.

Shopper conversation history stays in the browser session. Contact actions open a call or Instagram/WhatsApp draft for the shopper to send. Instagram API access is limited to authorized professional profiles and public media in this release; it does not automate merchant DMs.

The merchant portal at `/merchant` is optional and intended as a last resort for a shop that wants to maintain verified information directly. Merchants must verify email, and a system administrator approves shop claims and requested public sources first. Approved shop memberships authorize merchant updates only for their own shops. System administrator review queues and integrations live at `/admin/review` and `/admin/settings`.

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
import { Button } from "@workspace/ui/components/button"
```
