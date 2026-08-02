# Claude Usage Dashboard

A dashboard for aggregating and visualizing Claude Code usage statistics parsed from local
transcript files.

## Layout

- `server/` — NestJS backend that scans, parses, caches, and aggregates transcript data and
  serves it over HTTP.
- `web/` — frontend dashboard.

## Development

This is an npm workspace containing `server` and `web`. Install once from the repo root — it
installs both workspaces. (Each git worktree is its own checkout, so a fresh worktree needs its
own root `npm install`; hoisted `node_modules` lives at the worktree root.)

```bash
npm install                      # once, from the repo root — installs both workspaces

npm run dev                      # starts both: NestJS on :3000, Vite on :5173 (proxies /api to :3000)
npm run build                    # builds both packages
npm test                         # tests both packages
npm run typecheck                # typechecks both packages

npm run dev -w server             # just the API
npm run dev -w web                # just the frontend

npm test --prefix server -- run src/stats/parser.test.ts   # file-scoped
npm test --prefix web -- run src/api/filterStats.test.ts
```

The root `dev`/`build`/`test`/`typecheck` scripts fan out across both `server` and `web` via
Turborepo and have no per-file scoped variant — a filter still reaches both packages, and the one
that doesn't own the given file exits non-zero — so file-scoped testing stays per-package:
`npm test --prefix <pkg> -- run <path>`, as shown above. Running `npx turbo run test` directly
(bypassing the root script) drops the `-- run` pass-through argument, so it addresses a different
cache entry; run from an interactive terminal it also starts `vitest` in watch mode and won't
exit on its own, so the root scripts are the supported entry point.
