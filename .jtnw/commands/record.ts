// record.ts
import { logger } from "@/logger.js";
import type { BotRuntimeState } from "@/recording/types.js";
import {
	attachVoiceSessionHooks,
	createRecordingSession,
	startRecordingForCurrentSpeakers,
} from "@/utils/sessionPipeline.js";
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
		.setName("record")
		.setDescription("Record mapped players and DMs in the voice channel")
		.addBooleanOption((option) =>
			option
				.setName("live_transcription")
				.setDescription("Transcribe clips while recording"),
		)
		.addBooleanOption((option) =>
			option
				.setName("post_transcript")
				.setDescription("Post queued transcript messages in this text channel"),
		)
		.setContexts([InteractionContextType.Guild])
		.setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
	async execute(
		interaction: ChatInputCommandInteraction<"cached">,
		runtime: BotRuntimeState,
	) {
		if (interaction.isChatInputCommand()) {
			await interaction.deferReply({ flags: "Ephemeral" });
			const channel = interaction.member?.voice.channel;
			const liveTranscription =
				interaction.options.getBoolean("live_transcription") ?? false;
			const postTranscripts =
				interaction.options.getBoolean("post_transcript") ?? false;

			logger.info(
				{
					command: interaction.commandName,
					guildId: interaction.guildId,
					userId: interaction.user.id,
					voiceChannelId: channel?.id,
					liveTranscription,
					postTranscripts,
				},
				"Record command requested.",
			);

			if (postTranscripts && !liveTranscription) {
				await interaction.followUp({
					content:
						"`post_transcript` requires `live_transcription` to be enabled.",
					flags: "Ephemeral",
				});
				return;
			}

			if (!channel) {
				await interaction.followUp({
					content: "You must be in a voice channel!",
					flags: "Ephemeral",
				});
				return;
			}

			if (runtime.activeSessions.has(interaction.guildId)) {
				await interaction.followUp({
					content: "A recording session is already active in this server.",
					flags: "Ephemeral",
				});
				return;
			}

			let connection = getVoiceConnection(interaction.guildId);

			if (!connection) {
				if (!interaction.member.voice.channel) {
					await interaction.followUp({
						content: "This command can only be used while in a voice channel.",
						flags: "Ephemeral",
					});
					return;
				}
				logger.info(
					{
						guildId: interaction.guildId,
						voiceChannelId: interaction.member.voice.channel.id,
					},
					"Joining voice channel for recording.",
				);
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
				logger.info(
					{
						guildId: interaction.guildId,
						voiceChannelId: channel.id,
					},
					"Voice connection is ready for recording.",
				);
				const session = await createRecordingSession({
					guildId: interaction.guildId,
					voiceChannelId: channel.id,
					transcriptionChannelId: postTranscripts
						? interaction.channelId
						: null,
					liveTranscription,
					postTranscripts,
				});
				runtime.activeSessions.set(interaction.guildId, session);

				attachVoiceSessionHooks(
					connection,
					interaction.client,
					interaction.guildId,
					runtime,
				);
				await startRecordingForCurrentSpeakers(
					connection,
					interaction.client,
					interaction.guildId,
					runtime,
				);

				await interaction.followUp({
					content: `Recording mapped players and DMs. Session \`${session.sessionKey}\` started.${liveTranscription ? " Live transcription is enabled." : ""}${postTranscripts ? " Transcript posting is enabled for this channel." : ""}`,
					flags: "Ephemeral",
				});
			} catch (error) {
				logger.error(
					{
						err: error,
						guildId: interaction.guildId,
						voiceChannelId: channel.id,
					},
					"Failed to start recording session.",
				);
				const errorMessage =
					error instanceof Error ? error.message : "An unknown error occurred.";
				await interaction.followUp({
					content: `Error: ${errorMessage}`,
					flags: "Ephemeral",
				});
			}
		}
	},
};
