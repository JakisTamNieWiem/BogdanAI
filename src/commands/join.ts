// join.ts
import { logger } from "@/logger.js";
import {
	activeRecordings,
	createListeningStream,
	killAllFfmpeg,
} from "@/utils/createListeningStream";
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
	type Snowflake,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("join")
		.setDescription("Join a channel")
		.setContexts([InteractionContextType.Guild])
		.setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
	async execute(
		interaction: ChatInputCommandInteraction<"cached">,
		recordable: Set<Snowflake>,
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
			// Inside your execute function after creating the connection:
			connection.on(VoiceConnectionStatus.Disconnected, () => {
				console.log("Bot disconnected! Clearing all recording locks...");
				// If you export activeRecordings from createListeningStream, you can clear it here:
				activeRecordings.clear();
				killAllFfmpeg();
			});

			try {
				await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
				const receiver = connection.receiver;

				// Prevent attaching multiple listeners if /join is run more than once
				if (receiver.speaking.listenerCount("start") === 0) {
					receiver.speaking.on("start", async (userId) => {
						// Check if THIS GUILD is flagged for recording
						if (recordable.has(interaction.guildId)) {
							const user = await interaction.client.users.fetch(userId);
							createListeningStream(receiver, user);
						}
					});
				}

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
