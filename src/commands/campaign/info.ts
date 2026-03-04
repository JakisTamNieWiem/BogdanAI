import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { logger } from "@/logger.js";
import { BaseInteraction, EmbedBuilder } from "discord.js";
import { eq } from "drizzle-orm";

export default {
	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const guildId = interaction.guild?.id;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: "Ephemeral",
			});
			return;
		}

		try {
			const campaignId = parseInt(
				interaction.options.getString("campaign", true),
				10,
			);
			// Find the campaign
			const [campaign] = await db
				.select()
				.from(campaigns)
				.where(eq(campaigns.id, campaignId))
				.limit(1);

			if (!campaign) {
				await interaction.reply({
					content: `Campaign not found.`,
					flags: "Ephemeral",
				});
				return;
			}

			const playerIds = campaign.players;
			const playersText =
				playerIds.length > 0
					? playerIds.map((id) => `<@${id}>`).join(", ")
					: "No players yet";

			// Try to fetch DM's username from Discord

			const embed = new EmbedBuilder()
				.setTitle(`Campaign: ${campaign.name}`)
				.addFields(
					{ name: "ID", value: campaign.id.toString(), inline: true },
					{ name: "DM", value: `<@${campaign.dm}>`, inline: true },
					{
						name: "Description",
						value: campaign.description ?? "No description",
						inline: false,
					},
					{
						name: `Players (${campaign.players.length})`,
						value:
							campaign.players.map((id) => `<@${id}>`).join(", ") ??
							"No players",
						inline: false,
					},
					{
						name: "Guild ID",
						value: campaign.guildId.toString(),
						inline: true,
					},
				)
				.setColor("Purple")
				.setTimestamp()
				.setFooter({
					text: "Use /campaign add-player to add players to this campaign",
				});

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error fetching campaign info:", error);
			await interaction.reply({
				content:
					"There was an error fetching campaign information. Please try again.",
				flags: "Ephemeral",
			});
		}
	},
};
