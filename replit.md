# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- `GEMINI_API_KEY` enables the AI city guide and the dish-photo inspector.
- Run the database push command after adding the dish photo table so the gallery can save uploads.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, `drizzle-zod`
- Dish inspection: LangChain JS `ChatGoogle` with structured output
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/frederick-guide/` — static guide page, styling, and browser behavior
- `artifacts/api-server/` — Express API, dish-photo routes, and `src/agents/dishInspector.ts`
- `lib/db/src/schema/` — Drizzle/PostgreSQL table definitions
- `lib/api-spec/openapi.yaml` — API contract

## Architecture decisions

- Dish photos are stored as base64 text in PostgreSQL for this demo; the API serves the image bytes separately from gallery metadata.
- The browser resizes photos to at most 1280px before sending them to the API.
- Dish uploads are checked for a visible Maryland crab cake before any database write; inspection decisions are enforced server-side.

## Product

A local field guide to Frederick, Maryland, with city information, an AI guide, and a persistent gallery where visitors can share dish photos. An AI inspector rejects photos that do not visibly show a Maryland crab cake.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
