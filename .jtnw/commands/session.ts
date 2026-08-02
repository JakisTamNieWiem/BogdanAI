import type { BotRuntimeState } from "@/recording/types.js";
import { logger } from "@/logger.js";
import { summarizeSession } from "@/utils/sessionPipeline.js";
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("session")
		.setDescription("Manage recorded sessions")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("summarize")
				.setDescription("Generate a summary for the latest or selected session")
				.addIntegerOption((option) =>
					option
						.setName("session_id")
						.setDescription("A specific session id to summarize")
						.setMinValue(1),
				)
				.addBooleanOption((option) =>
					option
						.setName("force")
						.setDescription(
							"Allow overwriting an existing summary or summarizing a session with failed transcription jobs",
						),
				),
		)
		.setContexts([InteractionContextType.Guild])
		.setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
	async execute(
		interaction: ChatInputCommandInteraction<"cached">,
		_runtime: BotRuntimeState,
	) {
		if (!interaction.isChatInputCommand()) {
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		logger.info(
			`Session command ${interaction.commandName} with subcommand ${subcommand} executed`,
		);

		switch (subcommand) {
			case "summarize": {
				await interaction.deferReply();
				try {
					const sessionId =
						interaction.options.getInteger("session_id") ?? undefined;
					const force = interaction.options.getBoolean("force") ?? false;
					await summarizeSession(interaction, sessionId, force);
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : "Unknown summary error.";
					if (interaction.deferred || interaction.replied) {
						await interaction.editReply(`Error: ${errorMessage}`);
					} else {
						await interaction.reply({
							content: `Error: ${errorMessage}`,
							flags: "Ephemeral",
						});
					}
				}
				break;
			}
			default: {
				await interaction.reply({
					content: "Unknown subcommand.",
					flags: "Ephemeral",
				});
			}
		}
	},
};
