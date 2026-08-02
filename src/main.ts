import type { BotRuntimeState } from "@/recording/types.js";
import { startTranscriptionWorker } from "@/utils/sessionPipeline.js";
import { GatewayIntentBits, Routes } from "discord-api-types/v10";
import {
	Client,
	Collection,
	type Command,
	IntentsBitField,
	REST,
} from "discord.js";
import { readdirSync } from "fs";
import handleAutocomplete from "./commands/autocomplete.js";
import { logger } from "./logger.js";

/**
 * Load commands from the generated .jtnw folder
 */
async function loadCommandsFromGenerated(): Promise<
	Collection<string, Command>
> {
	const commands = new Collection<string, Command>();
	const commandsPath = `${process.cwd()}/src/commands`;

	try {
		// Get list of generated command files

		const commandFiles = readdirSync(commandsPath, { withFileTypes: true }).map(
			(path) => {
				if (path.isFile() && path.name.endsWith(".ts")) return path.name;
				else if (path.isDirectory()) return path.name + "/index.ts";
			},
		);

		// Load each command from the generated files
		for (const file of commandFiles) {
			if (!file) continue;
			const commandName = file.replace(".ts", "");
			try {
				const commandModule = await import(`${commandsPath}/${file}`);
				const command = commandModule.default as Command;

				if (command && command.data) {
					commands.set(command.data.name, command);
					logger.info(`Loaded command: ${command.data.name}`);
				}
			} catch (error) {
				logger.error(
					{
						err: error,
						commandName,
					},
					"Failed to load command.",
				);
			}
		}
	} catch (error) {
		logger.error(
			{ err: error },
			"Failed to load commands. Make sure to run the build script first:",
		);

		process.exit(1);
	}

	logger.info(`Loaded ${commands.size} commands from /src/commands folder`);
	return commands;
}

/**
 * Initialize and start the bot
 */
async function startBot() {
	logger.info("Starting bot initialization...");

	const client = new Client({
		intents: [
			IntentsBitField.Flags.DirectMessages,
			IntentsBitField.Flags.Guilds,
			IntentsBitField.Flags.GuildMembers,
			IntentsBitField.Flags.GuildMessages,
			IntentsBitField.Flags.GuildVoiceStates,
			IntentsBitField.Flags.MessageContent,
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildVoiceStates,
		],
		presence: { status: "online" },
	});

	logger.info("Discord client created, loading commands...");

	// Load commands from generated .jtnw folder
	client.commands = await loadCommandsFromGenerated();
	const commandsJSON = client.commands.map((c) => c.data.toJSON());
	logger.info(
		`Commands loaded and converted to JSON: ${commandsJSON.length} commands`,
	);
	const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);
	logger.info("REST client created, starting command registration...");

	try {
		logger.info("Started refreshing application (/) commands.");

		// Add timeout for command registration
		const commandRegistrationPromise = Promise.all([
			rest.put(
				Routes.applicationGuildCommands(
					"1130242686142660618",
					"547182730656481280",
				),
				{ body: commandsJSON },
			),

			rest.put(Routes.applicationCommands("1130242686142660618"), {
				body: commandsJSON,
			}),
		]);

		await Promise.race([
			commandRegistrationPromise,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error("Command registration timeout")),
					10000,
				),
			),
		]);

		logger.info("Successfully reloaded application (/) commands.");
		logger.info(
			`Loaded commands: ${client.commands.map((elem) => elem.data.name)}`,
		);
	} catch (error) {
		logger.error({ err: error }, "Failed to register commands.");
	}

	const runtime: BotRuntimeState = {
		activeSessions: new Map(),
		triggerTranscriptionWorker: () => {},
	};
	runtime.triggerTranscriptionWorker = startTranscriptionWorker(client);

	logger.info("Setting up event handlers...");
	client.on("clientReady", (c) => {
		logger.info(`Logged in as ${c.user.tag}`);
	});

	client.on("interactionCreate", async (interaction) => {
		let command: Command | undefined;
		if (interaction.isChatInputCommand()) {
			command = interaction.client.commands.get(interaction.commandName);
		} else if (interaction.isAutocomplete()) {
			await handleAutocomplete(interaction);
		} else if (interaction.isButton()) {
			if (interaction?.message?.interaction?.commandName === undefined) {
				logger.error("Button interaction command name not found!");
				return;
			}
			command = interaction.client.commands.get(
				interaction?.message?.interaction?.commandName,
			);
		} else {
			logger.info(`Unsupported interaction ${interaction.type}`);
			return;
		}
		try {
			if (command) {
				// All subcommand handling is now done within the command's execute function
				await command.execute(interaction, runtime);
			}
		} catch (error) {
			logger.error(
				{
					err: error,
					interactionType: interaction.type,
					commandName: command?.data.name,
				},
				"Interaction handler failed.",
			);
			if (interaction.isChatInputCommand()) {
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						content: "There was an error while executing this command!",
						flags: "Ephemeral",
					});
				} else {
					await interaction.reply({
						content: "There was an error while executing this command!",
						flags: "Ephemeral",
					});
				}
			}
		}
	});

	logger.info("Event handlers set up, attempting to login...");

	// Add timeout for bot login
	await Promise.race([
		client.login(process.env.TOKEN),
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Bot login timeout")), 15000),
		),
	]);

	logger.info("Bot login process initiated");
}

// Start the bot
startBot().catch((error) => {
	logger.fatal({ err: error }, "Bot startup failed.");
	process.exit(1);
});
