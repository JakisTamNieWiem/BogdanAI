#!/usr/bin/env bun

import {
	ApplicationCommandOptionType,
	AutocompleteInteraction,
	BaseInteraction,
	SlashCommandBuilder,
	type APIApplicationCommandOption,
	type APIApplicationCommandOptionChoice,
} from "discord.js";
import {
	existsSync,
	mkdirSync,
	readdir,
	readdirSync,
	statSync,
	unlink,
	writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

interface CommandModule {
	data: SlashCommandBuilder;
	execute: (interaction: BaseInteraction) => Promise<void>;
	subcommands?: Record<string, (interaction: BaseInteraction) => Promise<void>>;
	autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/**
 * Build script that merges command files into complete command modules
 * Discord.js doesn't support the split file approach natively, so this script
 * generates complete command files that can be directly imported by main.ts
 */
async function buildCommands() {
	const commandsDir = join(projectRoot, "src", "commands");
	const outputDir = join(projectRoot, ".jtnw", "commands");

	console.log("🔨 Building and merging commands...");

	// Ensure output directory exists
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}
	readdir(outputDir, (err, files) => {
		if (err) throw err;

		for (const file of files) {
			unlink(join(outputDir, file), (err) => {
				if (err) throw err;
			});
		}
	});

	const builtCommands = [];

	// Process simple commands (single files)
	const simpleCommands = await processSimpleCommands(commandsDir, outputDir);
	builtCommands.push(...simpleCommands);

	// Process command groups (directories with index.ts and subcommands)
	const groupCommands = await processCommandGroups(commandsDir, outputDir);
	builtCommands.push(...groupCommands);

	// Generate index file for easy importing
	await generateIndexFile(outputDir, builtCommands);

	console.log(`✅ Built ${builtCommands.length} commands to ${outputDir}`);
	console.log(`📁 Commands: ${builtCommands.map((c) => c).join(", ")}`);
}

/**
 * Process simple command files (not in directories)
 */
async function processSimpleCommands(
	commandsDir: string,
	outputDir: string,
): Promise<string[]> {
	const commands: string[] = [];
	const items = readdirSync(commandsDir, { withFileTypes: true });

	for (const item of items) {
		const fullPath = join(commandsDir, item.name);

		// Skip ignored commands (starting with _ or .)
		if (item.name.startsWith("_") || item.name.startsWith(".")) {
			console.log(`⏭️  Ignoring command: ${item}`);
			continue;
		}

		if (item.isFile() && item.name.match(/\.(ts|js)$/)) {
			const commandName = item.name.replace(/\.(ts|js)$/, "");
			const outputPath = join(outputDir, `${commandName}.ts`);

			// Generate merged command file
			await generateMergedCommand(fullPath, outputPath, commandName, false);
			commands.push(commandName);
		}
	}

	return commands;
}

/**
 * Process command groups (directories with index.ts and subcommands)
 */
async function processCommandGroups(
	commandsDir: string,
	outputDir: string,
): Promise<string[]> {
	const commands: string[] = [];
	const items = readdirSync(commandsDir);

	for (const item of items) {
		const fullPath = join(commandsDir, item);
		const stats = statSync(fullPath);

		// Skip ignored commands (starting with _ or .)
		if (item.startsWith("_") || item.startsWith(".")) {
			console.log(`⏭️  Ignoring command directory: ${item}`);
			continue;
		}

		if (stats.isDirectory()) {
			const indexPath = join(fullPath, "index.ts");
			if (existsSync(indexPath)) {
				const commandName = item;
				const outputPath = join(outputDir, `${commandName}.ts`);

				// Generate merged command file with subcommands
				await generateMergedCommand(
					indexPath,
					outputPath,
					commandName,
					true,
					fullPath,
				);
				commands.push(commandName);
			}
		}
	}

	return commands;
}

/**
 * Generate a merged command file that includes the main command and all subcommands
 */
async function generateMergedCommand(
	mainPath: string,
	outputPath: string,
	commandName: string,
	isGroup: boolean = false,
	groupPath?: string,
) {
	try {
		// Import the main command module
		const mainModule = await import(`file://${mainPath}`);
		const mainCommand = mainModule.default;

		if (!mainCommand) {
			console.warn(`⚠️  No default export found in ${mainPath}`);
			return;
		}

		// Handle simple commands
		if (!isGroup) {
			// For simple commands, just copy the original structure
			const content = await readFileContent(mainPath);
			writeFileSync(outputPath, content);
			console.log(`📝 Generated merged command: ${commandName}`);
			return;
		}

		// Handle command groups with subcommands
		const subcommands = await loadSubcommands(groupPath!);
		const autocompleteModule = await loadAutocomplete(groupPath!);

		// Collect all required imports dynamically from source files
		const imports = await collectRequiredImports(
			groupPath!,
			subcommands,
			autocompleteModule,
		);

		// Build command data with subcommands
		let commandData = `new SlashCommandBuilder()
			.setName("${mainCommand.data.name || commandName}")
			.setDescription("${mainCommand.data.description || "No description"}")`;

		// Add subcommands to the builder
		for (const subcommand of subcommands) {
			const subData = subcommand.data.toJSON();
			commandData += `\n			.addSubcommand(subcommand =>
				subcommand
					.setName("${subData.name}")
					.setDescription("${subData.description}")`;

			// Add options for the subcommand
			if (subData.options && subData.options.length > 0) {
				for (const option of subData.options) {
					// Skip subcommand options since we're already processing subcommands
					if (
						option.type === ApplicationCommandOptionType.Subcommand ||
						option.type === ApplicationCommandOptionType.SubcommandGroup
					) {
						continue;
					}
					commandData += generateOptionBuilder(option, "					");
				}
			}

			commandData += "\n			)";
		}

		// Build execute function with subcommand routing
		let executeFunction = `async execute(interaction: BaseInteraction) {
			// Handle autocomplete interactions
			if (interaction.isAutocomplete()) {
				await handleAutocomplete(interaction);
				return;
			}

			// Handle chat input command interactions
			if (!interaction.isChatInputCommand()) return;

			const subcommand = interaction.options.getSubcommand();

			logger.info(\`Command \${interaction.commandName} with subcommand \${subcommand} executed\`);

			switch (subcommand) {`;

		// Add subcommand cases
		for (const subcommand of subcommands) {
			const subName = subcommand.data.name;
			executeFunction += `\n				case "${subName}":
					await handle${capitalize(subName)}(interaction);
					break;`;
		}

		executeFunction += `\n				default:
					await interaction.reply({
						content: "Unknown subcommand",
						ephemeral: true
					});
			}
		}`;

		// Generate subcommand handler functions using dynamic imports
		let subcommandHandlers = "";

		for (const subcommand of subcommands) {
			const subName = subcommand.data.name;
			const subPath = join(groupPath!, `${subName}.ts`);

			try {
				// Import the subcommand module to get the execute function
				const subModule = await import(`file://${subPath}`);
				const executeFunction = subModule.default?.execute;

				if (executeFunction) {
					// Convert the function to a string and extract the body
					const funcString = executeFunction.toString();
					const functionBody = funcString
						.substring(funcString.indexOf("{") + 1, funcString.lastIndexOf("}"))
						.trim();

					subcommandHandlers += `\nasync function handle${capitalize(subName)}(interaction: BaseInteraction) {\n${functionBody}\n}`;
				}
			} catch (error) {
				console.error(`❌ Failed to extract function from ${subName}:`, error);
				// Add a placeholder function
				subcommandHandlers += `\nasync function handle${capitalize(subName)}(interaction: BaseInteraction) {\n\t// Function extraction failed\n\tawait interaction.reply({\n\t\tcontent: "This subcommand is temporarily unavailable.",\n\t\tephemeral: true\n\t});\n}`;
			}
		}

		// Generate autocomplete handler using dynamic imports
		let autocompleteHandler = "";
		if (autocompleteModule) {
			const autocompletePath = join(groupPath!, "autocomplete.ts");

			try {
				// Import the autocomplete module
				const autoModule = await import(`file://${autocompletePath}`);
				const autocompleteFunction = autoModule.default as (
					interaction: AutocompleteInteraction,
				) => Promise<void>;

				if (autocompleteFunction) {
					// Convert the function to a string and extract the body
					const funcString = autocompleteFunction.toString();
					const functionBody = funcString
						.substring(funcString.indexOf("{") + 1, funcString.lastIndexOf("}"))
						.trim();

					autocompleteHandler = `async function handleAutocomplete(interaction: BaseInteraction) {\n${functionBody}\n}`;
				}
			} catch (error) {
				console.error(`❌ Failed to extract autocomplete function:`, error);
			}
		}

		// Fallback if no autocomplete handler
		if (!autocompleteHandler) {
			autocompleteHandler = `async function handleAutocomplete(interaction: BaseInteraction) {\n\t// No autocomplete handler needed\n}`;
		}

		// Generate the complete command file
		const fullContent = `${Array.from(imports).join("\n")}

export default {
	data: ${commandData},

	${executeFunction}
};

${subcommandHandlers}

${autocompleteHandler}`;

		writeFileSync(outputPath, fullContent);
		console.log(`📝 Generated merged command: ${commandName}`);
	} catch (error) {
		console.error(`❌ Failed to build command ${commandName}:`, error);
	}
}

/**
 * Collect all required imports by extracting them from source files using regex and consolidating them
 */
async function collectRequiredImports(
	groupPath: string,
	subcommands: CommandModule[],
	autocompleteModule:
		| ((interaction: AutocompleteInteraction) => Promise<void>)
		| null,
): Promise<Set<string>> {
	// Use a Map to consolidate imports by module
	const importsByModule = new Map<string, Set<string>>();
	const sideEffectImports = new Set<string>();

	// Helper function to extract imports from a file using regex
	const extractImportsFromFile = async (filePath: string): Promise<void> => {
		try {
			const content = await readFileContent(filePath);

			// More specific regex patterns for different import types
			const namedImportRegex =
				/import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
			const defaultImportRegex =
				/import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+["']([^"']+)["']/g;
			const namespaceImportRegex =
				/import\s+\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+["']([^"']+)["']/g;
			const sideEffectImportRegex = /import\s+["']([^"']+)["']/g;

			// Process named imports
			let match;
			while ((match = namedImportRegex.exec(content)) !== null) {
				const [, , namedImports, module] = match;
				if (!module) continue; // Skip if no module found

				let importSet = importsByModule.get(module);
				if (!importSet) {
					importSet = new Set<string>();
					importsByModule.set(module, importSet);
				}
				if (!namedImports) continue;
				// Add all named imports
				namedImports.split(",").forEach((imp) => {
					const cleanImport = imp.trim();
					if (cleanImport) {
						importSet.add(cleanImport);
					}
				});
			}

			// Process default imports
			const defaultImports = [...content.matchAll(defaultImportRegex)];
			defaultImports.forEach(([, importName, module]) => {
				if (!module || !importName) return; // Skip if no module found

				let importSet = importsByModule.get(module);
				if (!importSet) {
					importSet = new Set<string>();
					importsByModule.set(module, importSet);
				}
				importSet.add(importName);
			});

			// Process namespace imports
			const namespaceImports = [...content.matchAll(namespaceImportRegex)];
			namespaceImports.forEach(([, alias, module]) => {
				if (!module) return; // Skip if no module found

				let importSet = importsByModule.get(module);
				if (!importSet) {
					importSet = new Set<string>();
					importsByModule.set(module, importSet);
				}
				importSet.add(`* as ${alias}`);
			});

			// Process side effect imports
			const sideEffectMatches = [...content.matchAll(sideEffectImportRegex)];
			sideEffectMatches.forEach(([, module]) => {
				if (!module) return; // Skip if no module found
				sideEffectImports.add(module);
			});
		} catch (error) {
			console.warn(`⚠️  Could not extract imports from ${filePath}:`, error);
		}
	};

	// Extract imports from index.ts
	const indexPath = join(groupPath, "index.ts");
	await extractImportsFromFile(indexPath);

	// Extract imports from all subcommand files
	for (const subcommand of subcommands) {
		const subPath = join(groupPath, `${subcommand.data.name}.ts`);
		await extractImportsFromFile(subPath);
	}

	// Extract imports from autocomplete.ts if it exists
	if (autocompleteModule) {
		const autocompletePath = join(groupPath, "autocomplete.ts");
		await extractImportsFromFile(autocompletePath);
	}

	// Consolidate imports and format them
	const consolidatedImports = new Set<string>();

	// Process consolidated imports by module
	for (const [module, importSet] of importsByModule) {
		const imports = Array.from(importSet);

		// Separate named imports, default imports, and namespace imports
		const namedImports = imports.filter(
			(imp: string) =>
				imp.startsWith("{") ||
				imp.includes(",") ||
				!imp.match(/^[a-zA-Z_$]|^\* as/),
		);
		const defaultImports = imports.filter(
			(imp: string) =>
				!imp.startsWith("{") && !imp.startsWith("*") && !imp.includes(","),
		);
		const namespaceImports = imports.filter((imp: string) =>
			imp.startsWith("* as"),
		);

		// Format the import statement
		let importStatement = "import {";

		const parts = [];

		// Add type imports first
		const typeImports = namedImports.filter((imp: string) =>
			imp.includes("type"),
		);
		if (typeImports.length > 0) {
			parts.push(
				`type { ${typeImports.map((imp: string) => imp.replace(/^\s*type\s*\{?\s*|\s*\}?$/g, "")).join(", ")}`,
			);
		}

		// Add named imports
		const regularNamedImports = namedImports.filter(
			(imp: string) => !imp.includes("type"),
		);
		if (regularNamedImports.length > 0) {
			parts.push(
				`{ ${regularNamedImports.map((imp: string) => imp.replace(/^\{?\s*|\s*\}?$/g, "")).join(", ")}`,
			);
		}

		// Add default imports
		if (defaultImports.length > 0) {
			parts.push(defaultImports.join(", "));
		}

		// Add namespace imports
		if (namespaceImports.length > 0) {
			parts.push(namespaceImports.join(", "));
		}

		importStatement += parts.join(", ");
		importStatement += `} from "${module}"`;

		consolidatedImports.add(importStatement);
	}

	// Add side effect imports
	for (const module of sideEffectImports) {
		consolidatedImports.add(`import {"${module}"`);
	}

	return consolidatedImports;
}

/**
 * Generate option builder code for a Discord.js option
 */
function generateOptionBuilder(
	option: APIApplicationCommandOption,
	indent: string,
): string {
	const optionType = option.type;
	const optionName = option.name;
	const optionDesc = option.description;
	const required = option.required;

	// Type guard function to check if option has autocomplete
	const hasAutocomplete = (
		opt: APIApplicationCommandOption,
	): opt is APIApplicationCommandOption & { autocomplete?: boolean } => {
		return "autocomplete" in opt;
	};

	const autocomplete = hasAutocomplete(option)
		? option.autocomplete
		: undefined;

	// Map Discord.js option types to builder methods
	const optionTypeMap: Record<number, string> = {
		3: "addStringOption",
		4: "addIntegerOption",
		5: "addBooleanOption",
		6: "addUserOption",
		7: "addChannelOption",
		8: "addRoleOption",
		9: "addMentionableOption",
		10: "addNumberOption",
		11: "addAttachmentOption",
	};

	const builderMethod = optionTypeMap[optionType] || "addStringOption";

	let builder = `\n${indent}.${builderMethod}(option =>
${indent}	option
${indent}		.setName("${optionName}")
${indent}		.setDescription("${optionDesc}")`;

	if (required) {
		builder += `\n${indent}		.setRequired(true)`;
	}

	if (autocomplete) {
		builder += `\n${indent}		.setAutocomplete(true)`;
	}

	// Type guard function to check if option has choices
	const hasChoices = (
		opt: APIApplicationCommandOption,
	): opt is APIApplicationCommandOption & {
		choices?: APIApplicationCommandOptionChoice[];
	} => {
		return (
			"choices" in opt && Array.isArray((opt as { choices?: unknown }).choices)
		);
	};

	// Add choices if they exist
	if (hasChoices(option) && option.choices && option.choices.length > 0) {
		for (const choice of option.choices) {
			builder += `\n${indent}		.addChoices(${JSON.stringify(choice)})`;
		}
	}

	builder += `\n${indent})`;

	return builder;
}

/**
 * Load all subcommands from a command directory
 */
async function loadSubcommands(groupPath: string): Promise<CommandModule[]> {
	const subcommands: CommandModule[] = [];
	const items = readdirSync(groupPath);

	for (const item of items) {
		const fullPath = join(groupPath, item);
		const stats = statSync(fullPath);

		if (
			stats.isFile() &&
			item.match(/\.(ts|js)$/) &&
			item !== "index.ts" &&
			item !== "autocomplete.ts" &&
			!item.startsWith("sub-")
		) {
			try {
				const module = await import(`file://${fullPath}`);
				const subcommand = module.default;

				if (subcommand && subcommand.data) {
					subcommands.push(subcommand);
				}
			} catch (error) {
				console.error(`❌ Failed to load subcommand ${item}:`, error);
			}
		}
	}

	return subcommands;
}

/**
 * Load autocomplete handler if it exists
 */
async function loadAutocomplete(
	groupPath: string,
): Promise<((interaction: AutocompleteInteraction) => Promise<void>) | null> {
	const autocompletePath = join(groupPath, "autocomplete.ts");

	if (!existsSync(autocompletePath)) {
		return null;
	}

	try {
		const module = await import(`file://${autocompletePath}`);
		return module.default as (
			interaction: AutocompleteInteraction,
		) => Promise<void>;
	} catch (error) {
		console.error(`❌ Failed to load autocomplete handler:`, error);
		return null;
	}
}

/**
 * Read file content
 */
async function readFileContent(filePath: string): Promise<string> {
	const fs = await import("fs/promises");
	return fs.readFile(filePath, "utf-8");
}

/**
 * Capitalize first letter of a string and convert hyphens to camelCase
 */
function capitalize(str: string): string {
	return str
		.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())
		.replace(/^./, (letter) => letter.toUpperCase());
}

/**
 * Generate an index file for easy importing
 */
async function generateIndexFile(outputDir: string, commands: string[]) {
	const indexContent = `// Auto-generated command exports
${commands.map((name) => `export { default as ${name} } from './${name}.ts';`).join("\n")}
`;

	const indexPath = join(outputDir, "index.ts");
	writeFileSync(indexPath, indexContent);
	console.log(`📄 Generated index file with ${commands.length} commands`);
}

// Run the build
buildCommands().catch(console.error);
