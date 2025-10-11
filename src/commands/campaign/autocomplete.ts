import { BaseInteraction } from "discord.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { like, eq } from "drizzle-orm";
import logger from "@/logger.js";

export default {
	async execute(interaction: BaseInteraction) {
		if (!interaction.isAutocomplete()) return;

		const focusedOption = interaction.options.getFocused(true);
		const subcommand = interaction.options.getSubcommand();

		try {
			if (
				subcommand === "info" ||
				subcommand === "delete" ||
				subcommand === "add-player" ||
				subcommand === "remove-player"
			) {
				const campaignName = focusedOption.value;
				const guildId = interaction.guild?.id;

				if (!guildId) {
					await interaction.respond([]);
					return;
				}

				const results = await db
					.select({
						id: campaigns.id,
						name: campaigns.name,
						dm: campaigns.dm,
					})
					.from(campaigns)
					.where(like(campaigns.name, `%${campaignName}%`))
					.limit(25);

				await interaction.respond(
					results.map((campaign) => ({
						name: campaign.name,
						value: campaign.name,
					})),
				);
			}
		} catch (error) {
			logger.error("Autocomplete error:", error);
			await interaction.respond([]);
		}
	},
};