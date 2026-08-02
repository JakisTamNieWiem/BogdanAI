import {logger} from "@/logger.js"
import {BaseInteraction, SlashCommandBuilder} from "discord.js"

export default {
	data: new SlashCommandBuilder()
			.setName("campaign")
			.setDescription("Manage D&D campaigns for your server"),

	async execute(interaction: BaseInteraction) {
			// Handle autocomplete interactions
			if (interaction.isAutocomplete()) {
				await handleAutocomplete(interaction);
				return;
			}

			// Handle chat input command interactions
			if (!interaction.isChatInputCommand()) return;

			const subcommand = interaction.options.getSubcommand();

			logger.info(`Command ${interaction.commandName} with subcommand ${subcommand} executed`);

			switch (subcommand) {
				default:
					await interaction.reply({
						content: "Unknown subcommand",
						ephemeral: true
					});
			}
		}
};



async function handleAutocomplete(interaction: BaseInteraction) {
	// No autocomplete handler needed
}