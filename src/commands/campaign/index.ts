import { logger } from "@/logger.js";
import { BaseInteraction, SlashCommandBuilder } from "discord.js";
import handleAutocomplete from "./autocomplete.ts";

export default {
	data: new SlashCommandBuilder()
		.setName("campaign")
		.setDescription("Manage D&D campaigns for your server")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("create")
				.setDescription("Create a new campaign"),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("info")
				.setDescription("View information about a campaign")
				.addStringOption((option) =>
					option
						.setName("name")
						.setDescription("The name of the campaign")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("delete")
				.setDescription("Delete a campaign (DM only)")
				.addStringOption((option) =>
					option
						.setName("name")
						.setDescription("The name of the campaign to delete")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
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
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("remove-player")
				.setDescription("Remove a player from a campaign (DM only)")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The campaign to remove the player from")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addUserOption((option) =>
					option
						.setName("player")
						.setDescription("The player to remove")
						.setRequired(true),
				),
		),

	async execute(interaction: BaseInteraction) {
		// Basic structure - build system will handle routing
		if (interaction.isChatInputCommand()) {
			const subcommand = interaction.options.getSubcommand();
			logger.info(
				`Campaign command ${interaction.commandName} with subcommand ${subcommand} executed`,
			);
			switch (subcommand) {
				case "create":
					await (await import("./create.ts")).default.execute(interaction);
					break;
				case "add-player":
					await (await import("./add-player.ts")).default.execute(interaction);
					break;
				case "remove-player":
					await (await import("./remove-player.ts")).default.execute(
						interaction,
					);
					break;
				case "delete":
					await (await import("./delete.js")).default.execute(interaction);
					break;
				case "info":
					await (await import("./info.js")).default.execute(interaction);
					break;
				default:
					await interaction.reply({
						content: "Unknown subcommand.",
						flags: "Ephemeral",
					});
			}
		} else if (interaction.isAutocomplete()) {
			await handleAutocomplete(interaction);
		}
	},
};
