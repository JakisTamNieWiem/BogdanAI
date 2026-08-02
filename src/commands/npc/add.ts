import { db } from "@/db/index.js";
import { campaigns, npcs } from "@/db/schema.js";
import { logger } from "@/logger.js";
import {
	BaseInteraction,
	EmbedBuilder,
	LabelBuilder,
	ModalBuilder,
	TextInputStyle,
} from "discord.js";
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
			// Find the campaign first to validate permissions
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

			// Check if user is the DM
			if (campaign.dm !== userId) {
				await interaction.reply({
					content: "Only the DM can add NPCs to a campaign.",
					flags: "Ephemeral",
				});
				return;
			}

			// Create and show modal
			const modal = new ModalBuilder()
				.setCustomId(`add-npc-${campaign.id}`)
				.setTitle(`Add NPC to ${campaignName}`);

			// Add text input components
			const nameInput = new LabelBuilder()
				.setLabel("Name")
				.setTextInputComponent((component) =>
					component
						.setCustomId("npc-name")
						.setStyle(TextInputStyle.Short)
						.setPlaceholder("Enter the NPC's name")
						.setRequired(true)
						.setMinLength(1)
						.setMaxLength(100),
				);

			const descriptionInput = new LabelBuilder()
				.setLabel("Description")
				.setTextInputComponent((component) =>
					component
						.setCustomId("npc-description")
						.setStyle(TextInputStyle.Paragraph)
						.setPlaceholder("Enter the NPC's description")
						.setMaxLength(1024),
				);

			const portraitInput = new LabelBuilder()
				.setLabel("Portrait URL")
				.setTextInputComponent((component) =>
					component
						.setCustomId("npc-portrait")
						.setStyle(TextInputStyle.Short)
						.setPlaceholder("Enter the NPC's portrait URL (optional)")
						.setMaxLength(256),
				);

			modal.addLabelComponents(nameInput, descriptionInput, portraitInput);

			await interaction.showModal(modal);

			// Wait for modal submission
			const submittedInteraction = await interaction.awaitModalSubmit({
				filter: (modalInteraction) =>
					modalInteraction.user.id === userId &&
					modalInteraction.customId === `add-npc-${campaign.id}`,
				time: 60_000, // 60 seconds timeout
			});

			// Get modal data
			const name = submittedInteraction.fields.getTextInputValue("npc-name");
			const description =
				submittedInteraction.fields.getTextInputValue("npc-description");
			const portrait =
				submittedInteraction.fields.getTextInputValue("npc-portrait") ||
				"No portrait provided";

			// Validate input
			if (name.length < 1 || name.length > 100) {
				await submittedInteraction.reply({
					content: "NPC name must be between 1 and 100 characters.",
					flags: "Ephemeral",
				});
				return;
			}

			if (description.length > 1024) {
				await submittedInteraction.reply({
					content: "NPC description must be max 1024 characters.",
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

			if (existingNPC.length > 0) {
				await submittedInteraction.reply({
					content: `An NPC named "${name}" already exists in campaign "${campaignName}".`,
					flags: "Ephemeral",
				});
				return;
			}

			// Create the new NPC
			const [newNPC] = await db
				.insert(npcs)
				.values({
					name,
					description,
					portrait,
					campaignId: campaign.id,
				})
				.returning();

			if (!newNPC) {
				await submittedInteraction.reply({
					content: "There was an error adding the NPC. Please try again.",
					flags: "Ephemeral",
				});
				return;
			}

			logger.info(
				`User ${submittedInteraction.user.tag} added NPC "${name}" to campaign "${campaignName}"`,
			);

			const embed = new EmbedBuilder()
				.setTitle("NPC Added! 🧙‍♂️")
				.setDescription(
					`Successfully added **${name}** to campaign **${campaignName}**`,
				)
				.setImage(portrait.startsWith("http") ? portrait : null)
				.addFields(
					{ name: "Name", value: name, inline: true },
					{ name: "Campaign", value: campaignName, inline: true },
					{ name: "NPC ID", value: newNPC.id.toString(), inline: true },
					{ name: "Description", value: description, inline: false },
				)
				.setColor("Green")
				.setTimestamp()
				.setFooter({ text: "Added by " + submittedInteraction.user.tag });

			await submittedInteraction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error adding NPC:", error);

			// Check if it's a timeout error
			if (error.message?.includes("time")) {
				await interaction.followUp({
					content: "Modal submission timed out. Please try again.",
					flags: "Ephemeral",
				});
			} else if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: "There was an error adding the NPC. Please try again.",
					flags: "Ephemeral",
				});
			} else {
				await interaction.reply({
					content: "There was an error adding the NPC. Please try again.",
					flags: "Ephemeral",
				});
			}
		}
	},
};
