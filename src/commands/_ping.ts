import { SlashCommandBuilder, BaseInteraction } from "discord.js";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Ping the bot"),

	async execute(interaction: BaseInteraction) {
		// TODO: Implement command logic here
		logger.info(`Command ${interaction.commandName} executed`);

		await interaction.reply({
			content: "This command is not implemented yet!",
			ephemeral: true,
		});
	},
};
