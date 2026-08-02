import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { logger } from "@/logger.js";
import {
	BaseInteraction,
	EmbedBuilder,
	LabelBuilder,
	ModalBuilder,
	TextInputStyle,
} from "discord.js";
import { eq } from "drizzle-orm";

export default {
	async execute(interaction: BaseInteraction) {
		if (!interaction.isChatInputCommand()) return;

		const userId = interaction.user.id;
		const username = interaction.user.tag;
		const guildId = interaction.guild?.id;

		if (!guildId) {
			await interaction.reply({
				content: "This command can only be used in a server.",
				flags: "Ephemeral",
			});
			return;
		}

		try {
			// Create and show modal
			const modal = new ModalBuilder()
				.setCustomId(`create-campaign-${guildId}`)
				.setTitle("Create New Campaign");

			// Add text input components
			const nameInput = new LabelBuilder()
				.setLabel("Campaign Name")
				.setTextInputComponent((component) =>
					component
						.setCustomId("campaign-name")
						.setStyle(TextInputStyle.Short)
						.setPlaceholder("Enter the campaign name")
						.setRequired(true)
						.setMinLength(3)
						.setMaxLength(100),
				);

			const descriptionInput = new LabelBuilder()
				.setLabel("Description (optional)")
				.setTextInputComponent((component) =>
					component
						.setCustomId("campaign-description")
						.setStyle(TextInputStyle.Paragraph)
						.setPlaceholder("Enter a brief description of your campaign")
						.setRequired(false)
						.setMaxLength(500),
				);
			const playersInput = new LabelBuilder()
				.setLabel("Players (optional)")
				.setUserSelectMenuComponent((component) =>
					component
						.setCustomId("campaign-players")
						.setPlaceholder("Select players for your campaign")
						.setRequired(false)
						.setMaxValues(25),
				);

			modal.addLabelComponents(nameInput, descriptionInput, playersInput);

			await interaction.showModal(modal);

			// Wait for modal submission
			const submittedInteraction = await interaction.awaitModalSubmit({
				filter: (modalInteraction) =>
					modalInteraction.user.id === userId &&
					modalInteraction.customId === `create-campaign-${guildId}`,
				time: 60_000, // 60 seconds timeout
			});

			// Get modal data
			const campaignName =
				submittedInteraction.fields.getTextInputValue("campaign-name");
			const description =
				submittedInteraction.fields.getTextInputValue("campaign-description") ||
				"No description provided";
			const campaignPlayers =
				submittedInteraction.fields.getSelectedUsers("campaign-players");
			// Validate campaign name
			if (campaignName.length < 3 || campaignName.length > 24) {
				await submittedInteraction.reply({
					content: "Campaign name must be between 3 and 24 characters.",
					flags: "Ephemeral",
				});
				return;
			}

			// Check if campaign with this name already exists in this guild
			const existingCampaign = await db
				.select()
				.from(campaigns)
				.where(eq(campaigns.name, campaignName))
				.limit(1);

			if (existingCampaign.length > 0) {
				await submittedInteraction.reply({
					content: `A campaign named "${campaignName}" already exists in this server.`,
					flags: "Ephemeral",
				});
				return;
			}

			// Create the new campaign
			const [newCampaign] = await db
				.insert(campaigns)
				.values({
					name: campaignName,
					description: description,
					dm: userId,
					players: campaignPlayers?.map((user) => user.id) ?? [],
					guildId,
				})
				.returning();

			if (!newCampaign) {
				await submittedInteraction.reply({
					content:
						"There was an error creating the campaign. Please try again.",
					flags: "Ephemeral",
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
					{
						name: "ID",
						value: newCampaign.id.toString(),
						inline: true,
					},
					{ name: "Description", value: description, inline: false },
					{
						name: `Players (${newCampaign.players.length})`,
						value:
							newCampaign.players.map((id) => `<@${id}>`).join(", ") ??
							"None yet. Use `/campaign add-player` to add players!",
						inline: false,
					},
				)
				.setColor("Green")
				.setTimestamp()
				.setFooter({ text: "Use /campaign help for more commands" });

			await submittedInteraction.reply({ embeds: [embed] });
		} catch (error) {
			console.log(error);
			logger.error("Error creating campaign:", error);

			// Check if it's a timeout error
			if (error.message?.includes("time")) {
				await interaction.followUp({
					content: "Modal submission timed out. Please try again.",
					flags: "Ephemeral",
				});
			} else if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content:
						"There was an error creating the campaign. Please try again.",
					flags: "Ephemeral",
				});
			} else {
				await interaction.reply({
					content:
						"There was an error creating the campaign. Please try again.",
					flags: "Ephemeral",
				});
			}
		}
	},
};
