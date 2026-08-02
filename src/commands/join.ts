// join.ts
import { logger } from "@/logger.js";
import { attachVoiceSessionHooks } from "@/utils/sessionPipeline.js";
import type { BotRuntimeState } from "@/recording/types.js";
import {
	entersState,
	getVoiceConnection,
	joinVoiceChannel,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("join")
		.setDescription("Join a channel")
		.setContexts([InteractionContextType.Guild])
		.setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
	async execute(
		interaction: ChatInputCommandInteraction<"cached">,
		runtime: BotRuntimeState,
	) {
		if (interaction.isChatInputCommand()) {
			logger.info(`Command ${interaction.commandName} executed`);
			await interaction.deferReply({ flags: "Ephemeral" });
			let connection = getVoiceConnection(interaction.guildId);

			if (!connection) {
				if (!interaction.member.voice.channel) {
					await interaction.followUp({
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
				await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
				attachVoiceSessionHooks(
					connection,
					interaction.client,
					interaction.guildId,
					runtime,
				);

				await interaction.followUp({ content: "Ready!", flags: "Ephemeral" });
			} catch (error) {
				console.warn(error);
				const errorMessage =
					error instanceof Error ? error.message : "An unknown error occurred.";
				// Fixed: Was reply(), but since we deferReply() earlier, it must be followUp()
				await interaction.followUp({
					content: `Error: ${errorMessage}`,
					flags: "Ephemeral",
				});
			}
		}
	},
};
