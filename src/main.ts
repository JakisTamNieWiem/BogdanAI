import { Client, IntentsBitField, REST, Routes, Collection, Command } from 'discord.js';
import * as fs from 'fs';
import path from 'path';
import { pino } from 'pino';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const client = new Client({
	intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMembers, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.GuildVoiceStates, IntentsBitField.Flags.MessageContent],
	presence: { status: 'idle' },
});
const logger = pino();
const prisma = new PrismaClient();

client.commands = new Collection();
const commands: Command[] = [];
const commandsPath = path.join(process.cwd(), 'bin/commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join('file:///', commandsPath, file);
	const command = await import(filePath);

	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command.default && 'execute' in command.default) {
		client.commands.set(command.default.data.name, command);
		commands.push(command.default.data);
	}
	else {
		logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}


const rest = new REST({ version: '10' }).setToken(process.env.TOKEN ?? '');

try {
	logger.info('Started refreshing application (/) commands.');
	await rest.put(Routes.applicationGuildCommands('1130242686142660618', '547182730656481280'), { body: commands });

	logger.info('Successfully reloaded application (/) commands.');
	logger.info(`Loaded commands: ${commands.map((elem) => elem.name)}`);
}
catch (error) {
	logger.error(error);
}

client.on('ready', (c) => {
	logger.info(`Logged in as ${c.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
	let command: Command | undefined;
	if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
		command = interaction.client.commands.get(interaction.commandName);
	}
	else if (interaction.isButton()) {
		if (interaction?.message?.interaction?.commandName === undefined) {
			logger.error('Button intearaction command name not found!');
			return;
		}
		command = interaction.client.commands.get(interaction?.message?.interaction?.commandName);
	}
	else if (interaction.isModalSubmit()) {
		command = interaction.client.commands.get(interaction.customId.split('-')[0]);
	}
	else {
		logger.info(`Unsupported interaction ${interaction.type}`);
		return;
	}
	try {
		if (command) {
			await command.default.execute(interaction, prisma);
		}
	}
	catch (error) {
		logger.error(error);
		if (interaction.isChatInputCommand()) {
			if ((interaction.replied || interaction.deferred)) {
				await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
			}
			else {
				await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
			}
		}
	}
});

client.login(process.env.TOKEN);