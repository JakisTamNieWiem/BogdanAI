import { logger } from "@/logger.js";
import { BaseInteraction, SlashCommandBuilder } from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("campaign")
		.setDescription("Manage D&D campaigns for your server")
		.addSubcommand((subcommand) =>
			subcommand.setName("create").setDescription("Create a new campaign"),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("info")
				.setDescription("View information about a campaign")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The name of the campaign")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("edit")
				.setDescription("Edit the campaign (DM only)")
				.addStringOption((option) =>
					option
						.setName("campaign")
						.setDescription("The campaign you want to edit")
						.setRequired(true)
						.setAutocomplete(true),
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
				case "edit":
					await (await import("./edit.ts")).default.execute(interaction);
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
		}
	},
};
