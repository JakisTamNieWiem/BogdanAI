# Command Utilities Guide

This document explains the command management utilities available in the Overgod bot project.

## 🚀 Add New Command

Use the `add-command` utility to quickly create new commands from templates.

### Usage

```bash
bun run add-command <command-name> [options]
```

### Options

- `--type, -t`: Command type - `"simple"` or `"complex"` (default: simple)
- `--description, -d`: Command description (optional)
- `--help, -h`: Show help message

### Examples

#### Simple Command
```bash
bun run add-command ping --type simple --description "Ping the bot"
```

This creates a single file: `src/commands/ping.ts`

#### Complex Command
```bash
bun run add-command admin --type complex --description "Admin management commands"
```

This creates a directory structure:
```
src/commands/admin/
├── index.ts          # Main command definition
├── example.ts        # Example subcommand
└── autocomplete.ts   # Autocomplete handler
```

### Command Types

#### Simple Commands
- Single file structure
- Basic command template
- Good for straightforward commands
- Example: `/ping`, `/help`

#### Complex Commands
- Directory structure with split files
- Supports subcommands
- Includes autocomplete template
- Better for organized, feature-rich commands
- Example: `/npc`, `/admin`

## 🚫 Ignore System

The build system supports ignoring commands that you don't want to load.

### How to Ignore Commands

1. **Prefix with underscore**: `_ignored-command.ts`
2. **Prefix with dot**: `.ignored-command.ts`
3. **Directory prefixes**: `_ignored-directory/` or `.ignored-directory/`

### Examples

```bash
# Ignore a simple command
mv src/commands/wip.ts src/commands/_wip.ts

# Ignore a complex command
mv src/commands/experimental/ src/commands/_experimental/

# These commands will be skipped during build with message:
# ⏭️  Ignoring command: _wip.ts
# ⏭️  Ignoring command directory: _experimental/
```

### Use Cases

- **Work in progress**: Commands being developed
- **Debug commands**: Temporary testing commands
- **Experimental features**: Commands not ready for production
- **Deprecated commands**: Keep old commands without loading them

## 📁 File Structure

### Simple Command Structure
```
src/commands/
├── mycommand.ts       # Single file command
└── _ignored.ts        # Ignored command
```

### Complex Command Structure
```
src/commands/
├── mycommand/         # Complex command directory
│   ├── index.ts      # Main command definition
│   ├── sub1.ts       # Subcommand 1
│   ├── sub2.ts       # Subcommand 2
│   └── autocomplete.ts # Autocomplete handler
└── _ignored/          # Ignored complex command
    ├── index.ts
    └── subcommand.ts
```

## 🔨 Build Process

The build system automatically:

1. **Discovers commands** from `src/commands/`
2. **Ignores commands** prefixed with `_` or `.`
3. **Merges split files** into Discord.js-compatible commands
4. **Generates commands** in `.jtnw/commands/`
5. **Loads generated commands** in the bot

### Build Output

```bash
bun run build
```

Example output:
```
🔨 Building and merging commands...
⏭️  Ignoring command: _wip.ts
📝 Generated merged command: ping
📝 Generated merged command: admin
✅ Built 2 commands to .jtnw/commands
📁 Commands: ping, admin
```

## 🛠️ Development Workflow

1. **Create command** using utility:
   ```bash
   bun run add-command mycommand --type complex
   ```

2. **Implement functionality** in generated files
3. **Test command** by running the bot:
   ```bash
   bun run dev
   ```

4. **Iterate** - edit files, they're automatically rebuilt

5. **Ignore when needed**:
   ```bash
   mv src/commands/mycommand src/commands/_mycommand
   ```

## 📝 Templates

The utility provides templates with:

- **Proper imports** and structure
- **Error handling** patterns
- **Logging** setup
- **Discord.js best practices**
- **TODO comments** for implementation

You can customize the templates in `scripts/add-command.ts` to match your project's coding style.

## 🎯 Best Practices

1. **Use descriptive names** for commands and subcommands
2. **Add detailed descriptions** using the `--description` flag
3. **Ignore incomplete commands** to avoid loading broken functionality
4. **Follow the template patterns** for consistency
5. **Test frequently** using the development server
6. **Keep subcommands focused** on single responsibilities

## 🐛 Troubleshooting

### Command Not Loading
- Check if the command name conflicts with existing commands
- Verify syntax is correct in all files
- Ensure the command isn't ignored (no `_` or `.` prefix)

### Build Errors
- Check TypeScript syntax in all command files
- Verify all imports are correct
- Look for console error messages during build

### Subcommand Issues
- Ensure subcommand files are properly named
- Check that `index.ts` exists for complex commands
- Verify subcommand data structure is correct

---

For more information about the bot architecture, see the main README.md and CLAUDE.md files.