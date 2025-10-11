import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import logger from "@/logger.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { eq, like } from "drizzle-orm";

export default {
	data: new SlashCommandBuilder()
			.setName("npc")
			.setDescription("Manage NPCs for your campaign")
			.addSubcommand(subcommand =>
				subcommand
					.setName("add")
					.setDescription("Add a new NPC")
					.addStringOption(option =>
						option
							.setName("name")
							.setDescription("The name of the NPC")
							.setRequired(true)
							.setAutocomplete(true)
					)
					.addStringOption(option =>
						option
							.setName("description")
							.setDescription("Description of the NPC")
					)
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName("remove")
					.setDescription("Remove an NPC")
					.addStringOption(option =>
						option
							.setName("name")
							.setDescription("The name of the NPC to remove")
							.setRequired(true)
							.setAutocomplete(true)
					)
			),

	async execute(interaction: BaseInteraction) {
			// Handle autocomplete interactions
			if (interaction.isAutocomplete()) {
				await handleAutocomplete(interaction);
				return;
			}

			// Handle chat input command interactions
			if (!interaction.isChatInputCommand()) return;

			const subcommand = interaction.options.getSubcommand();

			logger.info(`Command ${interaction.commandName} with subcommand ${subcommand} executed`);

			switch (subcommand) {
				case "add":
					await handleAdd(interaction);
					break;
				case "remove":
					await handleRemove(interaction);
					break;
				default:
					await interaction.reply({
						content: "Unknown subcommand",
						ephemeral: true
					});
			}
		}
};


async function handleAdd(interaction: BaseInteraction) {
if (!interaction.isChatInputCommand())
      return;
    const name = interaction.options.getString("name", !0), description = interaction.options.getString("description") || "No description provided";
    try {
      logger.info(`Adding NPC: ${name} with description: ${description}`);
      const embed = new EmbedBuilder().setTitle("NPC Added").setDescription(`Successfully added **${name}** to your campaign.`).addFields({ name: "Name", value: name }, { name: "Description", value: description }).setColor("Green").setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error adding NPC:", error);
      await interaction.reply({
        content: "There was an error adding the NPC. Please try again.",
        ephemeral: !0
      });
    }
}
async function handleRemove(interaction: BaseInteraction) {
if (!interaction.isChatInputCommand())
      return;
    const name = interaction.options.getString("name", !0);
    try {
      logger.info(`Removing NPC: ${name}`);
      const embed = new EmbedBuilder().setTitle("NPC Removed").setDescription(`Successfully removed **${name}** from your campaign.`).setColor("Red").setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error removing NPC:", error);
      await interaction.reply({
        content: "There was an error removing the NPC. Please try again.",
        ephemeral: !0
      });
    }
}

async function handleAutocomplete(interaction: BaseInteraction) {
	// No autocomplete handler needed
}