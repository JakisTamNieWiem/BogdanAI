import { logger } from "@/logger.js";
import { BaseInteraction, SlashCommandBuilder } from "discord.js";
import handleAutocomplete from "./autocomplete.ts";

export default {
	data: new SlashCommandBuilder()
		.setName("npc")
		.setDescription("Manage NPCs for your campaign")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("add")
				.setDescription("Add a new NPC")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The campaign to add the NPC to")
						.setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("edit")
				.setDescription("Edit a NPC")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The campaign to add the NPC to")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addStringOption((option) =>
					option
						.setName("name")
						.setDescription("The campaign to edit the NPC in")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("remove")
				.setDescription("Remove an NPC")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The campaign to remove the NPC from")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addStringOption((option) =>
					option
						.setName("name")
						.setDescription("The name of the NPC to remove")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("list")
				.setDescription("List all NPCs in a campaign")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The campaign to list NPCs from")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("info")
				.setDescription("Shows info about a NPC")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The campaign to add the NPC to")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addStringOption((option) =>
					option
						.setName("name")
						.setDescription("The name of the NPC")
						.setRequired(true)
						.setAutocomplete(true),
				),
		),

	async execute(interaction: BaseInteraction) {
		// Basic structure - build system will handle routing
		if (interaction.isChatInputCommand()) {
			const subcommand = interaction.options.getSubcommand();
			logger.info(
				`NPC command ${interaction.commandName} with subcommand ${subcommand} executed`,
			);
			switch (subcommand) {
				case "add": {
					await (await import("./add.ts")).default.execute(interaction);
					break;
				}
				case "edit": {
					await (await import("./edit.ts")).default.execute(interaction);
					break;
				}
				case "remove": {
					await (await import("./remove.ts")).default.execute(interaction);
					break;
				}
				case "list": {
					await (await import("./list.ts")).default.execute(interaction);
					break;
				}
				case "info": {
					await (await import("./info.ts")).default.execute(interaction);
					break;
				}
				default:
					await interaction.reply({
						content: "Unknown subcommand",
						ephemeral: true,
					});
			}
		} else if (interaction.isAutocomplete()) {
			await handleAutocomplete(interaction);
		}
	},
};
