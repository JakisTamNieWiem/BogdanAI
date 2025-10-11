import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("remove")
		.setDescription("Remove an NPC")
		.addStringOption((option) =>
			option
				.setName("name")
				.setDescription("The name of the NPC to remove")
				.setRequired(true)
				.setAutocomplete(true),
		),

	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const name = interaction.options.getString("name", true);

		try {
			// TODO: Add database logic to remove the NPC
			logger.info(`Removing NPC: ${name}`);

			const embed = new EmbedBuilder()
				.setTitle("NPC Removed")
				.setDescription(`Successfully removed **${name}** from your campaign.`)
				.setColor("Red")
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error removing NPC:", error);
			await interaction.reply({
				content: "There was an error removing the NPC. Please try again.",
				ephemeral: true,
			});
		}
	},
};
