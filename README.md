# Claude Usage Dashboard

A dashboard for aggregating and visualizing Claude Code usage statistics parsed from local
transcript files.

## Layout

- `server/` — NestJS backend that scans, parses, caches, and aggregates transcript data and
  serves it over HTTP.
- `web/` — frontend dashboard.

## Development

```bash
npm install --prefix server
npm test --prefix server
```
