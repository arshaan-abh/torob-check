# Torob Check

Next.js monorepo for the Torob in-person shopping assistant challenge.

## Local setup

Requirements: Node.js 20.9+, pnpm 11, and Docker Desktop running.

Copy the environment examples, then start and migrate PostgreSQL:

```bash
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm db:migrate
pnpm db:import
pnpm dev
```

`db:import` loads the CSV files in `dataset/` into an empty local database. It is a one-time import; rerunning it will hit the existing primary keys. Add your Neshan browser key and AI provider values to `apps/web/.env.local` when you have them. The AI provider settings are OpenAI-compatible so a provider can be chosen later.

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
