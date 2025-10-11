import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { eq } from "drizzle-orm";
import logger from "@/logger.js";

export default {
	data: new SlashCommandBuilder()
		.setName("create")
		.setDescription("Create a new campaign")
		.addStringOption((option) =>
			option
				.setName("name")
				.setDescription("The name of the campaign")
				.setRequired(true),
		),

	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const campaignName = interaction.options.getString("name", true);
		const userId = interaction.user.id;
		const username = interaction.user.tag;
		const guildId = interaction.guild?.id;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				ephemeral: true,
			});
			return;
		}

		// Validate campaign name
		if (campaignName.length < 3 || campaignName.length > 100) {
			await interaction.reply({
				content: "Campaign name must be between 3 and 100 characters.",
				ephemeral: true,
			});
			return;
		}

		try {
			// Check if campaign with this name already exists in this guild
			const existingCampaign = await db
				.select()
				.from(campaigns)
				.where(eq(campaigns.name, campaignName))
				.limit(1);

			if (existingCampaign.length > 0) {
				await interaction.reply({
					content: `A campaign named "${campaignName}" already exists in this server.`,
					ephemeral: true,
				});
				return;
			}

			// Create the new campaign
			const [newCampaign] = await db
				.insert(campaigns)
				.values({
					name: campaignName,
					dm: userId,
					players: [],
					guildId: parseInt(guildId),
				})
				.returning();

			if (!newCampaign) {
				await interaction.reply({
					content: "There was an error creating the campaign. Please try again.",
					ephemeral: true,
				});
				return;
			}

			logger.info(
				`User ${username} (${userId}) created campaign "${campaignName}"`,
			);

			const embed = new EmbedBuilder()
				.setTitle("Campaign Created! 🎲")
				.setDescription(`Successfully created campaign **${campaignName}**`)
				.addFields(
					{ name: "Campaign Name", value: campaignName, inline: true },
					{ name: "DM", value: username, inline: true },
					{ name: "Campaign ID", value: newCampaign.id.toString(), inline: true },
					{
						name: "Players",
						value: "None yet. Use `/campaign add-player` to add players!",
						inline: false,
					},
				)
				.setColor("Green")
				.setTimestamp()
				.setFooter({ text: "Use /campaign help for more commands" });

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error creating campaign:", error);
			await interaction.reply({
				content: "There was an error creating the campaign. Please try again.",
				ephemeral: true,
			});
		}
	},
};