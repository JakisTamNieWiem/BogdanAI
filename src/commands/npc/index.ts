import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("npc")
		.setDescription("Manage NPCs for your campaign"),

	async execute(interaction: BaseInteraction) {
		// Basic structure - build system will handle routing
		if (interaction.isChatInputCommand()) {
			const subcommand = interaction.options.getSubcommand();
			logger.info(
				`NPC command ${interaction.commandName} with subcommand ${subcommand} executed`,
			);
		}
	},
};
