# HelpHub Local Monorepo

This repository now follows a client/server architecture aligned with common industry practices. The frontend React application lives in `client/` and the backend Express API lives in `server/`.

## Structure

- `client/`: Vite + React application.
- `server/`: Express API written in TypeScript with versioned routing and environment validation.
- `tsconfig.base.json`: Shared TypeScript settings for all packages.

## Getting Started

```bash
npm install
npm run dev
```

The `dev` script runs both the Vite client (`http://localhost:5173`) and the API server (`http://localhost:4000`) in parallel. To run them individually:

```bash
npm run dev:client
npm run dev:server
```

## Environment Variables

- `client/.env` – frontend environment configuration (not committed).
- `server/.env` – backend environment configuration (use `server/.env.example` as a template).

## Recommended Next Steps

- Configure API routes in `server/src/routes/v1`.
- Point the client to the API base URL via environment variables.
- Add integration tests that exercise client ↔ server flows.

