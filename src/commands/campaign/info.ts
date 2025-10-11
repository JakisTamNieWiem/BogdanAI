import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { eq } from "drizzle-orm";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("info")
		.setDescription("View information about a campaign")
		.addStringOption((option) =>
			option
				.setName("name")
				.setDescription("The name of the campaign")
				.setRequired(true)
				.setAutocomplete(true),
		),

	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const campaignName = interaction.options.getString("name", true);

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

			const playerIds = campaign.players as string[];
			const playersText =
				playerIds.length > 0
					? playerIds.map((id) => `<@${id}>`).join(", ")
					: "No players yet";

			// Try to fetch DM's username from Discord
			let dmDisplay = `<@${campaign.dm}>`;
			try {
				const dmUser = await interaction.client.users.fetch(campaign.dm);
				if (dmUser) {
					dmDisplay = `${dmUser.tag}`;
				}
			} catch (error) {
				logger.warn(`Could not fetch DM user ${campaign.dm}:`, error);
			}

			const embed = new EmbedBuilder()
				.setTitle(`📋 ${campaign.name}`)
				.setDescription("Campaign Information")
				.addFields(
					{ name: "Campaign ID", value: campaign.id.toString(), inline: true },
					{ name: "Dungeon Master", value: dmDisplay, inline: true },
					{
						name: "Player Count",
						value: playerIds.length.toString(),
						inline: true,
					},
					{ name: "Players", value: playersText || "No players", inline: false },
					{ name: "Guild ID", value: campaign.guildId.toString(), inline: true },
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
				ephemeral: true,
			});
		}
	},
};