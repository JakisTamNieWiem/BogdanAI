// record.ts
import { logger } from "@/logger.js";
import {
	createListeningStream,
	userToCharacterMap,
} from "@/utils/createListeningStream";
import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
	type Snowflake,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("record")
		.setDescription("Start recording everyone in the channel") // Changed description
		// Removed the addUserOption
		.setContexts([InteractionContextType.Guild])
		.setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
	async execute(
		interaction: ChatInputCommandInteraction<"cached">,
		recordable: Set<Snowflake>,
	) {
		if (interaction.isChatInputCommand()) {
			logger.info(`Command ${interaction.commandName} executed`);
			let connection = getVoiceConnection(interaction.guildId);

			if (!connection) {
				if (!interaction.member.voice.channel) {
					await interaction.reply({
						content: "This command can only be used while in a voice channel.",
						flags: "Ephemeral",
					});
					return;
				}
				connection = joinVoiceChannel({
					adapterCreator: interaction.guild.voiceAdapterCreator,
					channelId: interaction.member.voice.channel.id,
					guildId: interaction.guild.id,
					selfDeaf: false,
					selfMute: true,
				});
			}

			try {
				// 1. Mark this GUILD as "actively recording everyone"
				recordable.add(interaction.guildId);

				// 2. Start recording anyone who is ALREADY speaking right now
				for (const userId of connection.receiver.speaking.users.keys()) {
					if (userId in Object.keys(userToCharacterMap)) {
						const user = await interaction.client.users.fetch(userId);
						createListeningStream(connection.receiver, user);
					}
				}

				await interaction.reply({
					content: "Listening to everyone!",
					flags: "Ephemeral",
				});
			} catch (error) {
				console.error(error);
				const errorMessage =
					error instanceof Error ? error.message : "An unknown error occurred.";
				await interaction.reply({
					content: `Error: ${errorMessage}`,
					flags: "Ephemeral",
				});
			}
		}
	},
};
