# Repository Guidelines

## Project Structure & Module Organization
Core application code lives in `src/`. Slash commands are defined in `src/commands/`, with larger commands split into folders such as `src/commands/npc/` and `src/commands/campaign/`. Database code lives in `src/db/`, reusable helpers in `src/utils/`, and the runtime entry point is `src/main.ts`. Tests currently live in `tests/` (for example `tests/roll.test.ts`). Static assets and seed data are stored under `data/`, while SQL migrations are tracked in `drizzle/` and Prisma schema files in `prisma/`. Generated JavaScript output is committed under `bin/`; update it only through the build scripts.

## Build, Test, and Development Commands
Use Bun for day-to-day work:

- `bun run dev` runs the bot from `src/main.ts` with Bun watch mode.
- `bun run start` starts the app with `nodemon` and pretty-printed logs.
- `bun run build` regenerates command artifacts from the split command sources.
- `bun run build:watch` rebuilds commands when source files change.
- `bun run migrate` applies Drizzle migrations.
- `bun run seed` seeds the database.
- `bun test` runs the Bun test suite in `tests/`.
- `bun run lint` checks `src/` with Biome; `bun run lint:fix` applies safe fixes.

## Coding Style & Naming Conventions
This repository uses TypeScript with ES modules and strict compiler settings. Biome is the formatting and linting authority; it enforces tab indentation and double quotes. Keep filenames lowercase with concise names (`roll.ts`, `searchspell.ts`), and use `index.ts` for grouped command entrypoints. Prefer path aliases such as `@/logger.js` and `@commands/*` over long relative imports.

## Testing Guidelines
Tests use `bun:test`. Place new tests in `tests/` and name them `*.test.ts`. Favor focused command-level coverage for parsing, validation, and reply formatting, following the style in `tests/roll.test.ts`. Run `bun test` before opening a pull request; add or update tests whenever command behavior or database logic changes.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects such as `save transcript without timestamps` or `switch from .mp3 to .ogg opus`. Keep commits small and descriptive, ideally one behavior change per commit. Pull requests should explain the user-facing change, note any schema or environment updates, and include screenshots or sample command output when responses or embeds change.

## Security & Configuration Tips
Keep secrets in `.env` only; never commit tokens, API keys, or local database paths. Treat `recordings/`, `transcriptions/`, and `logs/` as runtime data, not source. If you modify commands, rebuild generated artifacts before shipping so runtime and source stay in sync.
