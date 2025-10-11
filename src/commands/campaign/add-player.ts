import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { eq } from "drizzle-orm";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("add-player")
		.setDescription("Add a player to a campaign (DM only)")
		.addStringOption((option) =>
			option
				.setName("campaign")
				.setDescription("The campaign to add the player to")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addUserOption((option) =>
			option
				.setName("player")
				.setDescription("The player to add")
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
					content: "Only the DM can add players to a campaign.",
					ephemeral: true,
				});
				return;
			}

			// Check if user is trying to add themselves
			if (targetUser.id === userId) {
				await interaction.reply({
					content: "You cannot add yourself as a player. You are already the DM.",
					ephemeral: true,
				});
				return;
			}

			// Check if player is already in the campaign
			const currentPlayers = campaign.players as string[];
			if (currentPlayers.includes(targetUser.id)) {
				await interaction.reply({
					content: `${targetUser.username} is already a player in this campaign.`,
					ephemeral: true,
				});
				return;
			}

			// Add the player
			const updatedPlayers = [...currentPlayers, targetUser.id];
			await db
				.update(campaigns)
				.set({ players: updatedPlayers })
				.where(eq(campaigns.id, campaign.id));

			logger.info(
				`User ${username} (${userId}) added player ${targetUser.tag} (${targetUser.id}) to campaign "${campaignName}"`,
			);

			const embed = new EmbedBuilder()
				.setTitle("Player Added! 👥")
				.setDescription(
					`Successfully added **${targetUser.username}** to campaign **${campaignName}**`,
				)
				.addFields(
					{ name: "Campaign", value: campaignName, inline: true },
					{ name: "Added by", value: username, inline: true },
					{ name: "New Player", value: targetUser.toString(), inline: true },
					{
						name: "Total Players",
						value: updatedPlayers.length.toString(),
						inline: true,
					},
				)
				.setColor("Blue")
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error adding player:", error);
			await interaction.reply({
				content: "There was an error adding the player. Please try again.",
				ephemeral: true,
			});
		}
	},
};