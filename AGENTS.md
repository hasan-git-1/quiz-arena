# AGENTS.md

## Commands

### Typecheck
```sh
npm run typecheck
```
Runs `tsc --noEmit` across all packages in the monorepo (`@quizarena/shared-types`, `@quizarena/server`, `@quizarena/web`).

### Build
```sh
npm run build
```

### Dev
```sh
npm run dev
```

## Project Structure

- `packages/shared-types/src/index.ts` — Shared TypeScript types and Socket.IO event contracts
- `apps/server/src/` — Express + Socket.IO + Prisma + Redis server
- `apps/web/src/` — React 18 + Vite client
