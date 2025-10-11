import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("campaign")
		.setDescription("Manage D&D campaigns for your server"),

	async execute(interaction: BaseInteraction) {
		// Basic structure - build system will handle routing
		if (interaction.isChatInputCommand()) {
			const subcommand = interaction.options.getSubcommand();
			logger.info(
				`Campaign command ${interaction.commandName} with subcommand ${subcommand} executed`,
			);
		}
	},
};