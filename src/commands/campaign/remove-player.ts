import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { eq } from "drizzle-orm";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("remove-player")
		.setDescription("Remove a player from a campaign (DM only)")
		.addStringOption((option) =>
			option
				.setName("campaign")
				.setDescription("The campaign to remove the player from")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addUserOption((option) =>
			option
				.setName("player")
				.setDescription("The player to remove")
				.setRequired(true),
		),

	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const campaignName = interaction.options.getString("campaign", true);
		const targetUser = interaction.options.getUser("player", true);
		const userId = interaction.user.id;
		const username = interaction.user.tag;

		if (!targetUser) {
			await interaction.reply({
				content: "Invalid user specified.",
				ephemeral: true,
			});
			return;
		}

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
					content: "Only the DM can remove players from a campaign.",
					ephemeral: true,
				});
				return;
			}

			// Check if player is in the campaign
			const currentPlayers = campaign.players as string[];
			if (!currentPlayers.includes(targetUser.id)) {
				await interaction.reply({
					content: `${targetUser.username} is not a player in this campaign.`,
					ephemeral: true,
				});
				return;
			}

			// Remove the player
			const updatedPlayers = currentPlayers.filter(
				(playerId) => playerId !== targetUser.id,
			);
			await db
				.update(campaigns)
				.set({ players: updatedPlayers })
				.where(eq(campaigns.id, campaign.id));

			logger.info(
				`User ${username} (${userId}) removed player ${targetUser.tag} (${targetUser.id}) from campaign "${campaignName}"`,
			);

			const embed = new EmbedBuilder()
				.setTitle("Player Removed! 👋")
				.setDescription(
					`Successfully removed **${targetUser.username}** from campaign **${campaignName}**`,
				)
				.addFields(
					{ name: "Campaign", value: campaignName, inline: true },
					{ name: "Removed by", value: username, inline: true },
					{ name: "Removed Player", value: targetUser.toString(), inline: true },
					{
						name: "Remaining Players",
						value: updatedPlayers.length.toString(),
						inline: true,
					},
				)
				.setColor("Orange")
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error removing player:", error);
			await interaction.reply({
				content: "There was an error removing the player. Please try again.",
				ephemeral: true,
			});
		}
	},
};