import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("add")
		.setDescription("Add a new NPC")
		.addStringOption((option) =>
			option
				.setName("name")
				.setDescription("The name of the NPC")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addStringOption((option) =>
			option.setName("description").setDescription("Description of the NPC"),
		),

	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const name = interaction.options.getString("name", true);
		const description =
			interaction.options.getString("description") || "No description provided";

		try {
			// TODO: Add database logic to save the NPC
			logger.info(`Adding NPC: ${name} with description: ${description}`);

			const embed = new EmbedBuilder()
				.setTitle("NPC Added")
				.setDescription(`Successfully added **${name}** to your campaign.`)
				.addFields(
					{ name: "Name", value: name },
					{ name: "Description", value: description },
				)
				.setColor("Green")
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error adding NPC:", error);
			await interaction.reply({
				content: "There was an error adding the NPC. Please try again.",
				ephemeral: true,
			});
		}
	},
};
