import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { logger } from "@/logger.js";
import {
	BaseInteraction,
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
			const campaignId = parseInt(
				interaction.options.getString("campaign", true),
				10,
			);
			const [campaign] = await db
				.select()
				.from(campaigns)
				.where(eq(campaigns.id, campaignId))
				.limit(1);
			console.log(campaign);
			if (!campaign) {
				interaction.reply("Campaign not found!");
				return;
			}
			// Create and show modal
			const modal = new ModalBuilder()
				.setCustomId(`edit-campaign-${guildId}`)
				.setTitle("Edit Campaign");

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
						.setMaxLength(100)
						.setValue(campaign.name),
				);

			const descriptionInput = new LabelBuilder()
				.setLabel("Description")
				.setTextInputComponent((component) =>
					component
						.setCustomId("campaign-description")
						.setStyle(TextInputStyle.Paragraph)
						.setPlaceholder("Enter a brief description of your campaign")
						.setRequired(false)
						.setMaxLength(500)
						.setValue(campaign.description ?? ""),
				);
			const playersInput = new LabelBuilder()
				.setLabel("Players")
				.setUserSelectMenuComponent((component) =>
					component
						.setCustomId("campaign-players")
						.setPlaceholder("Select players for your campaign")
						.setRequired(false)
						.setMaxValues(25)
						.setDefaultUsers(campaign.players),
				);

			modal.addLabelComponents(nameInput, descriptionInput, playersInput);

			await interaction.showModal(modal);

			// Wait for modal submission
			const submittedInteraction = await interaction.awaitModalSubmit({
				filter: (modalInteraction) =>
					modalInteraction.user.id === userId &&
					modalInteraction.customId === `edit-campaign-${guildId}`,
				time: 60_000, // 60 seconds timeout
			});

			// Get modal data

			const campaignName =
				submittedInteraction.fields.getTextInputValue("campaign-name") ??
				campaign.name;
			const description =
				submittedInteraction.fields.getTextInputValue("campaign-description") ??
				campaign.description;
			const campaignPlayers =
				submittedInteraction.fields
					.getSelectedUsers("campaign-players")
					?.map((user) => user.id) ?? campaign.players;
			// Validate campaign name
			if (campaignName.length < 3 || campaignName.length > 24) {
				await submittedInteraction.reply({
					content: "Campaign name must be between 3 and 24 characters.",
					flags: "Ephemeral",
				});
				return;
			}

			const [newCampaign] = await db
				.update(campaigns)
				.set({
					name: campaignName,
					description: description,
					dm: userId,
					players: campaignPlayers,
					guildId: parseInt(guildId),
				})
				.where(eq(campaigns.id, campaignId))
				.returning();

			if (!newCampaign) {
				await submittedInteraction.reply({
					content: "There was an error editing the campaign. Please try again.",
					flags: "Ephemeral",
				});
				return;
			}

			logger.info(
				`User ${username} (${userId}) edited campaign "${campaignName}"`,
			);

			await submittedInteraction.reply({
				content: "Changes to the campaing saved!",
				flags: "Ephemeral",
			});
		} catch (error) {
			console.log(error);
			logger.error("Error editing campaign:", error);

			// Check if it's a timeout error
			if (error.message?.includes("time")) {
				await interaction.followUp({
					content: "Modal submission timed out. Please try again.",
					flags: "Ephemeral",
				});
			} else if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: "There was an error editing the campaign. Please try again.",
					flags: "Ephemeral",
				});
			} else {
				await interaction.reply({
					content: "There was an error editing the campaign. Please try again.",
					flags: "Ephemeral",
				});
			}
		}
	},
};
