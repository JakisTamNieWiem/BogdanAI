import { logger } from "@/logger.js";
import { getVoiceConnection } from "@discordjs/voice";
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
	type Snowflake,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("leave")
		.setDescription("Leave a channel")
		.setContexts([InteractionContextType.Guild])
		.setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
	async execute(
		interaction: ChatInputCommandInteraction<"cached">,
		recordable: Set<Snowflake>,
	) {
		if (interaction.isChatInputCommand()) {
			logger.info(`Command ${interaction.commandName} executed`);
			const connection = getVoiceConnection(interaction.guildId);
			if (!connection) {
				await interaction.reply({
					content: "Not in a voice channel in this server!",
					flags: "Ephemeral",
				});
				return;
			}
			try {
				connection.destroy();

				recordable.clear();

				await interaction.reply({
					content: "Left the channel!",
					flags: "Ephemeral",
				});
			} catch (error) {
				console.warn(error);
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
