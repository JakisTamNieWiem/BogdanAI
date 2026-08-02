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
		const npcName = interaction.options.getString("name", true);
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
			// Check if NPC with this name already exists in the campaign
			const existingNPC = await db
				.select()
				.from(npcs)
				.where(and(eq(npcs.name, npcName), eq(npcs.campaignId, campaign.id)))
				.limit(1);

			if (existingNPC.length === 0) {
				await interaction.reply({
					content: `An NPC named "${npcName}" doesn't exists in campaign "${campaignName}".`,
					flags: "Ephemeral",
				});
				return;
			}
			// Create and show modal
			const modal = new ModalBuilder()
				.setCustomId(`edit-npc-${campaign.id}`)
				.setTitle(`Edit NPC in ${campaignName}`);

			// Add text input components
			const nameInput = new LabelBuilder()
				.setLabel("Name")
				.setTextInputComponent((component) =>
					component
						.setCustomId("npc-name")
						.setValue(npcName)
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
						.setValue(existingNPC[0]?.description || "")
						.setStyle(TextInputStyle.Paragraph)
						.setPlaceholder("Enter the NPC's description")
						.setRequired(true)
						.setMaxLength(256),
				);

			const portraitInput = new LabelBuilder()
				.setLabel("Portrait URL")
				.setTextInputComponent((component) =>
					component
						.setCustomId("npc-portrait")
						.setValue(existingNPC[0]?.portrait || "No portrait provided")
						.setStyle(TextInputStyle.Short)
						.setPlaceholder("Enter the NPC's portrait URL (optional)")
						.setMaxLength(100),
				);

			modal.addLabelComponents(nameInput, descriptionInput, portraitInput);

			await interaction.showModal(modal);

			// Wait for modal submission
			const submittedInteraction = await interaction.awaitModalSubmit({
				filter: (modalInteraction) =>
					modalInteraction.user.id === userId &&
					modalInteraction.customId === `edit-npc-${campaign.id}`,
				time: 60_000, // 60 seconds timeout
			});

			// Get modal data
			const name = submittedInteraction.fields.getTextInputValue("npc-name");
			const description =
				submittedInteraction.fields.getTextInputValue("npc-description");
			const portrait =
				submittedInteraction.fields.getTextInputValue("npc-portrait") ||
				"No portrait provided";

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

			if (description.length < 1 || description.length > 2000) {
				await interaction.reply({
					content: "NPC description must be between 1 and 256 characters.",
					flags: "Ephemeral",
				});
				return;
			}

			// Create the new NPC
			const [newNPC] = await db
				.update(npcs)
				.set({
					name,
					description,
					portrait,
					campaignId: campaign.id,
				})
				.where(eq(npcs.id, parseInt(npcName, 10)))
				.returning();

			if (!newNPC) {
				await interaction.reply({
					content: "There was an error editing the NPC. Please try again.",
					flags: "Ephemeral",
				});
				return;
			}

			logger.info(
				`User ${interaction.user.tag} edited NPC "${name}" to campaign "${campaignName}"`,
			);

			const embed = new EmbedBuilder()
				.setTitle("NPC Changed! 🧙‍♂️")
				.setDescription(
					`Successfully changed **${name}** to campaign **${campaignName}**`,
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
				.setFooter({ text: "Changed by " + interaction.user.tag });

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			logger.error("Error editing NPC:", error);

			// Check if it's a timeout error
			if (error.message?.includes("time")) {
				await interaction.followUp({
					content: "Modal submission timed out. Please try again.",
					flags: "Ephemeral",
				});
			} else if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: "There was an error editing the NPC. Please try again.",
					flags: "Ephemeral",
				});
			} else {
				await interaction.reply({
					content: "There was an error editing the NPC. Please try again.",
					flags: "Ephemeral",
				});
			}
		}
	},
};
