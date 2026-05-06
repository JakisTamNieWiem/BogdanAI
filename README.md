# Overgod Discord Bot

A feature-rich Discord bot built for tabletop RPG (D&D) campaigns, providing spell search, dice rolling, NPC/quest management, and tarot readings.

## Features

- **Spell Search**: Search through D&D spells with detailed information
- **Dice Rolling**: Advanced dice rolling system with multiple dice types
- **NPC Management**: Add, remove, and manage NPCs for your campaign with autocomplete
- **Quest Management**: Track and organize campaign quests
- **Tarot Readings**: mystical tarot card readings for your RPG sessions
- **Database Integration**: Persistent storage using SQLite with Drizzle ORM
- **Autocomplete**: Smart autocomplete for command options
- **Modern Build System**: Split-file development with automated command generation

## Technology Stack

- **Runtime**: Bun (JavaScript runtime)
- **Language**: TypeScript
- **Database**: SQLite with Drizzle ORM
- **Framework**: Discord.js v14
- **Build System**: Custom command generation and merging
- **Logging**: Pino logger with pretty printing

## Getting Started

### Prerequisites

- Node.js 18+ or Bun runtime
- Discord Bot Token
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Overseer-bot
   ```

2. **Install dependencies**
   ```bash
   bun install
   # or
   npm install
   ```

3. **Environment Setup**

   Create a `.env` file in the root directory:
   ```env
   TOKEN=your_discord_bot_token_here
   DB_FILE_NAME=./data/overseer.db
   ```

4. **Database Setup**
   ```bash
   # Run database migrations
   bun run migrate

   # Seed database with initial data (optional)
   bun run seed
   ```

## Development

### Running the Bot

- **Development Mode** (with file watching and hot reload):
  ```bash
  bun run dev
  ```

- **Production Mode**:
  ```bash
  bun run start
  ```

### Building Commands

The bot uses a custom build system that allows split-file development while generating Discord.js-compatible commands. The build script automatically runs before starting the bot in development mode.

```bash
# Build commands manually
bun run build
```

### Code Quality

```bash
# Run linter
bun run lint

# Auto-fix linting issues
bun run lint:fix
```

## Commands

### /npc - NPC Management
Manage NPCs for your campaign with subcommands:
- **add**: Add a new NPC with name and description
- **remove**: Remove an NPC from your campaign
- Supports autocomplete for NPC names

### /roll - Dice Rolling
Roll various types of dice:
- Supports standard dice notation (d20, 2d6, etc.)
- Multiple dice types
- Custom modifiers

### /searchspell - Spell Search
Search through D&D spells:
- Search by name, school, level, or class
- Detailed spell information
- Filtering options

### /quest - Quest Management
Manage campaign quests:
- Add, remove, and track quests
- Quest status management
- Campaign organization

### /petarda - Special Command
Unique custom command for special effects.

## Architecture

### Command System

The bot uses a sophisticated command architecture that allows developers to work with split files while maintaining Discord.js compatibility:

1. **Development Structure**: Commands are split into multiple files in `src/commands/`
   - Main command file (`index.ts`)
   - Subcommand files (`add.ts`, `remove.ts`)
   - Autocomplete handlers (`autocomplete.ts`)

2. **Build Process**: The build script in `scripts/build-commands.ts` merges split files into complete command modules in the `.jtnw/commands/` directory

3. **Runtime Loading**: The bot loads only the generated command files, ensuring Discord.js compatibility

### Database Schema

- **spells**: D&D spell information
- **quests**: Campaign quest data
- **campaigns**: Campaign management
- **npcs**: Non-player character data
- **playerCharacters**: Player character information

### Project Structure

```
src/
├── main.ts              # Bot entry point
├── discord.d.ts         # Discord.js type extensions
├── logger.ts           # Logging configuration
├── types.ts            # Additional TypeScript types
├── commands/           # Discord slash commands (source)
│   ├── template.ts     # Command template
│   ├── roll.ts         # Dice rolling
│   ├── searchspell.ts  # Spell search
│   ├── tarot.ts        # Tarot readings
│   ├── petarda.ts      # Special command
│   └── npc/           # NPC management (split files)
│       ├── index.ts     # Main NPC command
│       ├── add.ts       # Add NPC subcommand
│       ├── remove.ts    # Remove NPC subcommand
│       └── autocomplete.ts # NPC autocomplete
├── db/                # Database layer
│   ├── schema.ts      # Drizzle schema definitions
│   ├── relations.ts   # Database relations
│   ├── migrate.ts     # Migration runner
│   └── seed.ts        # Database seeding
└── utils/             # Utility functions
    └── command-router.ts # Command routing utility

scripts/
└── build-commands.ts  # Command build system

.jtnw/
└── commands/          # Generated command files
    ├── index.ts       # Command exports
    ├── npc.ts         # Generated NPC command
    └── ...

data/                 # Static data files
    ├── spells.json   # Spell database
    └── ...
```

## Configuration

### TypeScript Configuration

- Path aliases configured for easy imports (`@/*`, `@commands/*`, etc.)
- Strict mode enabled
- Modern ESNext target
- Module resolution optimized for Bun runtime

### Database Configuration

Uses SQLite with Drizzle ORM for efficient data management. Database file location controlled by `DB_FILE_NAME` environment variable.

### Discord Bot Setup

1. Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot user and copy the token
3. Enable appropriate intents (Guilds, Guild Messages, etc.)
4. Invite the bot to your server with required permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add new commands using the split-file structure
5. Run the build system to generate commands
6. Test thoroughly
7. Submit a pull request

### Adding New Commands

1. Create a new file in `src/commands/` or a new directory for complex commands
2. Follow the established patterns for command structure
3. For subcommands, create separate files in a subdirectory
4. Use the build script to generate the final command
5. Test in development mode

### Command Template

Use `src/commands/template.ts` as a starting point for new commands:

```typescript
import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import { logger } from "@/logger.js";

export default {
    data: new SlashCommandBuilder()
        .setName("commandname")
        .setDescription("Command description"),

    async execute(interaction: BaseInteraction) {
        // Command logic here
    },
};
```

## Troubleshooting

### Common Issues

1. **Commands not loading**: Ensure you've run the build script (`bun run build`)
2. **Database errors**: Check that migrations have been run (`bun run migrate`)
3. **Token errors**: Verify your Discord bot token in `.env` file
4. **Permission errors**: Ensure bot has proper Discord permissions

### Logging

The bot uses Pino for structured logging. In development mode, logs are formatted with pino-pretty for better readability.

## License

ISC License

## Support

For issues and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the Discord.js documentation for specific API questions

---

*Built with ❤️ for the tabletop RPG community*