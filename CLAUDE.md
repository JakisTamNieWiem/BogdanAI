# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Instructions for Claude
- Use context7 for all tastks.

## Project Overview

This is a Discord bot called "Overgod" built with TypeScript, Bun runtime, and Drizzle ORM with SQLite. The bot provides tabletop RPG (D&D) functionality including spell search, dice rolling, NPC/quest management, and tarot readings.

## Development Commands

### Running the Bot
- `bun run dev` - Development mode with file watching (automatically builds commands first)
- `npm run start` - Production mode with nodemon and pino-pretty logging

### Build System
- `bun run build` - Build commands from split files to Discord.js-compatible format
- Commands are generated in `.jtnw/commands/` directory
- Build script runs automatically before development mode

### Code Quality
- `bun run lint` - Run Biome linter
- `bun run lint:fix` - Auto-fix linting issues

### Database Operations
- `bun run migrate` - Run database migrations
- `bun run seed` - Seed database with initial data

### Drizzle Kit Commands
Database migrations are managed through Drizzle Kit. The configuration is in `drizzle.config.ts` with output directory `./drizzle`.

## Architecture

### Core Components

**Entry Point**: `src/main.ts`
- Initializes Discord client with intents for guild messages, members, voice states
- Sets up SQLite database with Drizzle ORM
- Loads all commands from `.jtnw/commands/` directory (generated files)
- Registers application commands with Discord API
- Handles interaction routing and error handling

**Database**: `src/db/schema.ts`
- Uses Drizzle ORM with SQLite
- Main tables: `spells`, `quests`, `campaigns`, `npcs`, `playerCharacters`
- Includes TypeScript types for D&D classes and skills
- Defines relations between campaigns, quests, and NPCs

**Command System**:
- **Development**: Commands are written in split files in `src/commands/` directory for better organization
- **Build Process**: `scripts/build-commands.ts` merges split files into Discord.js-compatible commands using **dynamic imports** (no regex)
- **Generated Files**: Final commands are stored in `.jtnw/commands/` and loaded by main.ts
- **Structure**:
  - Simple commands: Single files (e.g., `roll.ts`, `tarot.ts`)
  - Complex commands: Directories with `index.ts`, subcommand files (`add.ts`, `remove.ts`), and `autocomplete.ts`
- **Function Extraction**: Uses `Function.toString()` and dynamic imports for reliable code extraction
- **Runtime**: Generated commands handle subcommand routing internally with switch statements
- **Features**: Supports both chat input and autocomplete interactions

**TypeScript Configuration**:
- Path aliases: `@/*`, `@commands/*`, `@events/*`, `@utils/*`, `@config/*`, `@data/*`
- Strict mode enabled with modern ESNext target
- Module resolution set to bundler mode

### Project Structure
```
src/
├── main.ts              # Bot entry point
├── discord.d.ts         # Discord.js type extensions
├── logger.ts           # Logging configuration
├── types.ts            # Additional TypeScript types
├── commands/           # Discord slash commands (source files)
│   ├── template.ts     # Command template
│   ├── roll.ts         # Dice rolling
│   ├── searchspell.ts  # Spell search
│   ├── tarot.ts        # Tarot readings
│   ├── petarda.ts      # Special command
│   └── npc/           # NPC management commands (split files)
│       ├── index.ts    # Main NPC command definition
│       ├── add.ts      # Add NPC subcommand
│       ├── remove.ts   # Remove NPC subcommand
│       └── autocomplete.ts # NPC autocomplete handler
├── db/                # Database layer
│   ├── schema.ts      # Drizzle schema definitions
│   ├── relations.ts   # Database relations
│   ├── migrate.ts     # Migration runner
│   └── seed.ts        # Database seeding
└── utils/             # Utility functions

scripts/
└── build-commands.ts  # Command build system

.jtnw/
└── commands/          # Generated Discord.js-compatible commands
    ├── index.ts       # Command exports
    ├── npc.ts         # Generated NPC command (merged)
    ├── roll.ts        # Generated roll command
    └── ...            # Other generated commands

data/                 # Static data files
    ├── spells.json   # Spell database
    └── ...
```

### Environment Variables
Required environment variables (stored in `.env`):
- `TOKEN` - Discord bot token
- `DB_FILE_NAME` - SQLite database file path

### Code Style
- Uses Biome for linting and formatting (configured in `biome.json`)
- Enforces const declarations, no explicit any types, no var usage
- Tab indentation for TypeScript files
- TypeScript strict mode enabled

### Data Management
- Static data files stored in `data/` directory (spells, creatures, etc.)
- JSON files contain game data like spells and creature information

## Command Development

### Creating New Commands

1. **Simple Commands**: Create a single `.ts` file in `src/commands/`
2. **Complex Commands with Subcommands**: Create a directory with:
   - `index.ts` - Main command definition with SlashCommandBuilder
   - `subcommand-name.ts` - Individual subcommand implementations
   - `autocomplete.ts` - Autocomplete handler (optional)

### Command Structure Pattern

```typescript
// Simple command (src/commands/mycommand.ts)
import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import logger from "@/logger.js";

export default {
    data: new SlashCommandBuilder()
        .setName("mycommand")
        .setDescription("Command description"),

    async execute(interaction: BaseInteraction) {
        // Command logic here
    },
};
```

```typescript
// Complex command (src/commands/mycommand/index.ts)
import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import logger from "@/logger.js";

export default {
    data: new SlashCommandBuilder()
        .setName("mycommand")
        .setDescription("Command description")
        .addSubcommand(subcommand =>
            subcommand.setName("sub1").setDescription("First subcommand")
        )
        .addSubcommand(subcommand =>
            subcommand.setName("sub2").setDescription("Second subcommand")
        ),

    async execute(interaction: BaseInteraction) {
        // Basic structure - build system handles routing
    },
};
```

### Build Process

1. Run `bun run build` to merge split files into Discord.js-compatible commands
2. Generated files appear in `.jtnw/commands/`
3. Main.ts loads only from `.jtnw/commands/` directory
4. Build script uses **dynamic imports** to reliably extract function code (no brittle regex)
5. Build script automatically handles subcommand routing and autocomplete merging
6. Function extraction is robust and handles complex code structures

### Important Notes

- **Never edit files in `.jtnw/commands/` directly** - they will be overwritten
- **Always run build script** after modifying source commands
- **Development mode** (`bun run dev`) automatically builds commands first
- **Use proper TypeScript types** for Discord.js interactions
- **Include error handling** and logging in all commands