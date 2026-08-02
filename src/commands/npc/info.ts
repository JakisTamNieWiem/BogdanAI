import { db } from "@/db/index.js";
import { campaigns, npcs } from "@/db/schema.js";
import { logger } from "@/logger.js";
import { BaseInteraction, EmbedBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";

export default {
	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const campaignName = interaction.options.getString("campaign", true);
		const name = interaction.options.getString("name", true);

		const guildId = interaction.guild?.id;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: "Ephemeral",
			});
			return;
		}

		// Validate input
		if (name.length < 1 || name.length > 100) {
			await interaction.reply({
				content: "NPC name must be between 1 and 100 characters.",
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
						eq(campaigns.id, parseInt(campaignName, 10)),
						eq(campaigns.guildId, guildId),
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

			// Check if NPC with this name already exists in the campaign
			const existingNPC = await db
				.select()
				.from(npcs)
				.where(and(eq(npcs.name, name), eq(npcs.campaignId, campaign.id)))
				.limit(1);

			if (existingNPC.length === 0) {
				await interaction.reply({
					content: `An NPC named "${name}" doesn't exist in campaign "${campaignName}".`,
					flags: "Ephemeral",
				});
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle("NPC Info! 🧙‍♂️")
				.setImage(
					existingNPC[0]?.portrait &&
						existingNPC[0]?.portrait.startsWith("http")
						? existingNPC[0]?.portrait
						: null,
				)
				.addFields(
					{ name: "Name", value: name, inline: true },
					{ name: "Campaign", value: campaignName, inline: true },
					{
						name: "Description",
						value: existingNPC[0]?.description!,
						inline: false,
					},
				)
				.setColor("Green")
				.setTimestamp()
				.setFooter({ text: "Added by " + interaction.user.tag });

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error adding NPC:", error);
			await interaction.reply({
				content:
					"There was an error while attempting to show info about the NPC. Please try again.",
				flags: "Ephemeral",
			});
		}
	},
};
