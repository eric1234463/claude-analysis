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

npm run dev -w server            # NestJS on :3000
npm run dev -w web               # Vite on :5173, proxying /api to :3000

npm test --prefix server -- run  # file-scoped: append a path
npm test --prefix web -- run
```

Root-level `dev`/`build`/`test` commands aren't wired up yet — run each package's scripts via
`-w`/`--prefix` as shown above.
