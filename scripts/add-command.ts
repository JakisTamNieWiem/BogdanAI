#!/usr/bin/env bun

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");
const commandsDir = join(projectRoot, "src", "commands");

interface CommandOptions {
	name: string;
	type: "simple" | "complex";
	description?: string;
}

// Command templates
const SIMPLE_COMMAND_TEMPLATE = `import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import { logger } from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("{{name}}")
		.setDescription("{{description}}"),

	async execute(interaction: BaseInteraction) {
		// TODO: Implement command logic here
		logger.info(\`Command \${interaction.commandName} executed\`);

		await interaction.reply({
			content: "This command is not implemented yet!",
			ephemeral: true
		});
	},
};
`;

const COMPLEX_COMMAND_INDEX_TEMPLATE = `import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import { logger } from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("{{name}}")
		.setDescription("{{description}}"),

	async execute(interaction: BaseInteraction) {
		// This will be handled by the build system
		// The router will automatically handle subcommand routing
		if (interaction.isChatInputCommand()) {
			const subcommand = interaction.options.getSubcommand();
			logger.info(\`\${{name}} command \${interaction.commandName} with subcommand \${subcommand} executed\`);
		}
	},
};
`;

const COMPLEX_COMMAND_SUBCOMMAND_TEMPLATE = `import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import { logger } from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("{{subcommand}}")
		.setDescription("{{description}}")
		{{#if options}}
		{{#each options}}
		.{{this.type}}(option =>
			option
				.setName("{{this.name}}")
				.setDescription("{{this.description}}")
				{{#if this.required}}
				.setRequired(true)
				{{/if}}
				{{#if this.autocomplete}}
				.setAutocomplete(true)
				{{/if}}
		)
		{{/each}}
		{{/if}},

	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		try {
			// TODO: Implement {{subcommand}} logic here
			logger.info(\`Executing {{subcommand}} subcommand\`);

			await interaction.reply({
				content: "{{subcommand}} subcommand is not implemented yet!",
				ephemeral: true
			});
		} catch (error) {
			logger.error("Error in {{subcommand}} subcommand:", error);
			await interaction.reply({
				content: "There was an error executing this subcommand.",
				ephemeral: true
			});
		}
	},
};
`;

const COMPLEX_COMMAND_AUTOCOMPLETE_TEMPLATE = `import { BaseInteraction } from "discord.js";
import { logger } from "@/logger.js";

export default async function handleAutocomplete(interaction: BaseInteraction) {
	if (!interaction.isAutocomplete()) return;

	const focusedValue = interaction.options.getFocused(true);
	const focusedOption = focusedValue.name;

	try {
		// TODO: Add autocomplete logic here
		logger.info(\`Autocomplete requested for \${focusedOption}\`);

		let choices: string[] = [];

		// Example: Provide choices based on focused option
		if (focusedOption === "example") {
			choices = [
				"Example Choice 1",
				"Example Choice 2",
				"Example Choice 3"
			];

			const currentValue = focusedValue.value.toLowerCase();
			choices = choices.filter(choice =>
				choice.toLowerCase().includes(currentValue)
			);

			// Limit to 25 results as per Discord API limit
			choices = choices.slice(0, 25);
		}

		await interaction.respond(
			choices.map(choice => ({ name: choice, value: choice }))
		);

	} catch (error) {
		logger.error("Error in autocomplete:", error);
		// Don't respond on error to avoid interaction timeout issues
	}
}
`;

/**
 * Simple template replacement (no Handlebars dependency)
 */
function replaceTemplate(
	template: string,
	variables: Record<string, any>,
): string {
	let result = template;

	for (const [key, value] of Object.entries(variables)) {
		const regex = new RegExp(`{{${key}}}`, "g");
		result = result.replace(regex, String(value));
	}

	// Handle simple conditionals
	result = result.replace(
		/{{#if (\w+)}}([\s\S]*?){{\/if}}/g,
		(match, varName, content) => {
			return variables[varName] ? content : "";
		},
	);

	return result;
}

/**
 * Get existing commands to avoid naming conflicts
 */
function getExistingCommands(): string[] {
	if (!existsSync(commandsDir)) return [];

	const items = readdirSync(commandsDir, { withFileTypes: true });
	const commands: string[] = [];

	for (const item of items) {
		if (item.name.startsWith("_") || item.name.startsWith(".")) continue;

		if (item.isFile() && item.name.match(/\.(ts|js)$/)) {
			commands.push(item.name.replace(/\.(ts|js)$/, ""));
		} else if (item.isDirectory()) {
			// Check if it has an index.ts file
			if (existsSync(join(commandsDir, item.name, "index.ts"))) {
				commands.push(item.name);
			}
		}
	}

	return commands;
}

/**
 * Create a new command
 */
async function createCommand(options: CommandOptions) {
	const { name, type, description } = options;

	// Validate command name
	if (!name || !name.match(/^[a-z0-9-_]+$/i)) {
		console.error(
			"❌ Invalid command name. Use only letters, numbers, hyphens, and underscores.",
		);
		process.exit(1);
	}

	// Check for naming conflicts
	const existingCommands = getExistingCommands();
	if (existingCommands.includes(name)) {
		console.error(`❌ Command "${name}" already exists.`);
		process.exit(1);
	}

	// Create command files
	if (type === "simple") {
		const filePath = join(commandsDir, `${name}.ts`);
		const template = replaceTemplate(SIMPLE_COMMAND_TEMPLATE, {
			name,
			description: description || `A new simple command called ${name}`,
		});

		writeFileSync(filePath, template);
		console.log(`✅ Created simple command: ${filePath}`);
	} else if (type === "complex") {
		// Create directory
		const commandDir = join(commandsDir, name);
		mkdirSync(commandDir, { recursive: true });

		// Create index.ts
		const indexPath = join(commandDir, "index.ts");
		const indexTemplate = replaceTemplate(COMPLEX_COMMAND_INDEX_TEMPLATE, {
			name,
			description: description || `A new complex command called ${name}`,
		});
		writeFileSync(indexPath, indexTemplate);
		console.log(`✅ Created complex command index: ${indexPath}`);

		// Create example subcommand
		const subcommandPath = join(commandDir, "example.ts");
		const subcommandTemplate = replaceTemplate(
			COMPLEX_COMMAND_SUBCOMMAND_TEMPLATE,
			{
				name,
				subcommand: "example",
				description: "Example subcommand",
				options: [
					{
						type: "addStringOption",
						name: "input",
						description: "Example input",
						required: false,
					},
				],
			},
		);
		writeFileSync(subcommandPath, subcommandTemplate);
		console.log(`✅ Created example subcommand: ${subcommandPath}`);

		// Create autocomplete handler
		const autocompletePath = join(commandDir, "autocomplete.ts");
		writeFileSync(autocompletePath, COMPLEX_COMMAND_AUTOCOMPLETE_TEMPLATE);
		console.log(`✅ Created autocomplete handler: ${autocompletePath}`);
	}

	// Build commands
	console.log("\n🔨 Building commands...");
	const { spawn } = await import("child_process");
	const buildProcess = spawn("bun", ["run", "build"], {
		stdio: "inherit",
		cwd: projectRoot,
	});

	buildProcess.on("close", (code) => {
		if (code === 0) {
			console.log(`\n🎉 Command "${name}" created successfully!`);
			console.log(
				`💡 Don't forget to run 'bun run dev' to test your new command.`,
			);
		} else {
			console.error(`❌ Build failed with code ${code}`);
		}
	});
}

/**
 * Show help
 */
function showHelp() {
	console.log(`
🚀 Command Generator Utility

Usage: bun run scripts/add-command.ts <command-name> [options]

Arguments:
  command-name    Name of the command (letters, numbers, hyphens, underscores only)

Options:
  --type, -t      Command type: "simple" or "complex" (default: simple)
  --description, -d Command description (optional)
  --help, -h      Show this help message

Examples:
  bun run scripts/add-command.ts ping --type simple --description "Ping the bot"
  bun run scripts/add-command.ts admin --type complex --description "Admin management commands"

Note:
  - Simple commands are single files with basic functionality
  - Complex commands create a directory with subcommands and autocomplete support
  - Commands starting with "_" or "." are ignored by the build system
`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
	showHelp();
	process.exit(0);
}

const commandName = args[0];
if (!commandName) {
	console.error("❌ Command name is required.");
	showHelp();
	process.exit(1);
}
const options: CommandOptions = {
	name: commandName,
	type: "simple",
	description: undefined,
};

// Parse options
for (let i = 1; i < args.length; i++) {
	const arg = args[i];

	if (arg === "--type" || arg === "-t") {
		const type = args[++i];
		if (type !== "simple" && type !== "complex") {
			console.error('❌ Type must be "simple" or "complex"');
			process.exit(1);
		}
		options.type = type;
	} else if (arg === "--description" || arg === "-d") {
		options.description = args[++i];
	}
}

// Create the command
createCommand(options).catch(console.error);
