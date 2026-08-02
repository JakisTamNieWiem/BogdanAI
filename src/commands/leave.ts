import { logger } from "@/logger.js";
import type { BotRuntimeState } from "@/recording/types.js";
import { finalizeRecordingSession } from "@/utils/sessionPipeline.js";
import { getVoiceConnection } from "@discordjs/voice";
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("leave")
		.setDescription("Leave a channel")
		.setContexts([InteractionContextType.Guild])
		.setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
	async execute(
		interaction: ChatInputCommandInteraction<"cached">,
		runtime: BotRuntimeState,
	) {
		if (interaction.isChatInputCommand()) {
			logger.info(`Command ${interaction.commandName} executed`);
			const connection = getVoiceConnection(interaction.guildId);
			const activeSession = runtime.activeSessions.get(interaction.guildId);
			if (!connection && !activeSession) {
				await interaction.reply({
					content: "Not in a voice channel in this server!",
					flags: "Ephemeral",
				});
				return;
			}
			try {
				if (connection) {
					logger.info(
						{
							guildId: interaction.guildId,
						},
						"Destroying voice connection after leave command.",
					);
					connection.destroy();
				}
				const finalizedSession = await finalizeRecordingSession(
					interaction.guildId,
					runtime,
				);
				runtime.triggerTranscriptionWorker();

				await interaction.reply({
					content: finalizedSession
						? `Left the channel and finalized session \`${finalizedSession.sessionKey}\`.`
						: "Left the channel!",
					flags: "Ephemeral",
				});
			} catch (error) {
				logger.error(
					{
						err: error,
						guildId: interaction.guildId,
					},
					"Leave command failed.",
				);
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
