import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { eq, and } from "drizzle-orm";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("delete")
		.setDescription("Delete a campaign (DM only)")
		.addStringOption((option) =>
			option
				.setName("name")
				.setDescription("The name of the campaign to delete")
				.setRequired(true)
				.setAutocomplete(true),
		),

	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const campaignName = interaction.options.getString("name", true);
		const userId = interaction.user.id;
		const username = interaction.user.tag;

		try {
			// Find the campaign
			const [campaign] = await db
				.select()
				.from(campaigns)
				.where(eq(campaigns.name, campaignName))
				.limit(1);

			if (!campaign) {
				await interaction.reply({
					content: `Campaign "${campaignName}" not found.`,
					ephemeral: true,
				});
				return;
			}

			// Check if user is the DM
			if (campaign.dm !== userId) {
				await interaction.reply({
					content: "Only the DM can delete a campaign.",
					ephemeral: true,
				});
				return;
			}

			// Delete the campaign
			await db.delete(campaigns).where(eq(campaigns.id, campaign.id));

			logger.info(
				`User ${username} (${userId}) deleted campaign "${campaignName}"`,
			);

			const embed = new EmbedBuilder()
				.setTitle("Campaign Deleted 🗑️")
				.setDescription(`Campaign **${campaignName}** has been deleted.`)
				.addFields(
					{ name: "Deleted by", value: username, inline: true },
					{ name: "Campaign ID", value: campaign.id.toString(), inline: true },
				)
				.setColor("Red")
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error deleting campaign:", error);
			await interaction.reply({
				content: "There was an error deleting the campaign. Please try again.",
				ephemeral: true,
			});
		}
	},
};