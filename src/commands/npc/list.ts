import { db } from "@/db/index.js";
import { campaigns, npcs } from "@/db/schema.js";
import { logger } from "@/logger.js";
import { BaseInteraction, EmbedBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";

export default {
	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const campaignName = interaction.options.getString("campaign", true);
		const userId = interaction.user.id;
		const guildId = interaction.guild?.id;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: "Ephemeral",
			});
			return;
		}

		try {
			// Find the campaign
			const [campaign] = await db
				.select()
				.from(campaigns)
				.where(
					and(
						eq(campaigns.name, campaignName),
						eq(campaigns.guildId, parseInt(guildId)),
					),
				)
				.limit(1);

			if (!campaign) {
				await interaction.reply({
					content: `Campaign "${campaignName}" not found in this server.`,
					flags: "Ephemeral",
				});
				return;
			}

			// Check if user is the DM or a player
			const isDM = campaign.dm === userId;
			const isPlayer = campaign.players.includes(userId);

			if (!isDM && !isPlayer) {
				await interaction.reply({
					content: "Only the DM or players can view NPCs in a campaign.",
					flags: "Ephemeral",
				});
				return;
			}

			// Get all NPCs in the campaign
			const npcsInCampaign = await db
				.select()
				.from(npcs)
				.where(eq(npcs.campaignId, campaign.id))
				.orderBy(npcs.name);

			if (npcsInCampaign.length === 0) {
				const embed = new EmbedBuilder()
					.setTitle(`NPCs in ${campaignName} 📜`)
					.setDescription("No NPCs found in this campaign.")
					.setColor("Yellow")
					.setTimestamp();

				await interaction.reply({ embeds: [embed] });
				return;
			}

			// Create embed with NPC list
			const embed = new EmbedBuilder()
				.setTitle(`NPCs in ${campaignName} 📜`)
				.setDescription(
					`Found ${npcsInCampaign.length} NPC(s) in this campaign.`,
				)
				.setColor("Blue")
				.setTimestamp()
				.setFooter({
					text: `Requested by ${interaction.user.tag}`,
				});

			// Add each NPC as a field
			npcsInCampaign.forEach((npc, index) => {
				const shortDescription =
					npc.description && npc.description.length > 100
						? npc.description.substring(0, 97) + "..."
						: npc.description;

				embed.addFields({
					name: `${index + 1}. ${npc.name} (ID: ${npc.id})`,
					value: shortDescription ?? "No description provided.",
					inline: false,
				});
			});

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error listing NPCs:", error);
			await interaction.reply({
				content: "There was an error listing the NPCs. Please try again.",
				flags: "Ephemeral",
			});
		}
	},
};
