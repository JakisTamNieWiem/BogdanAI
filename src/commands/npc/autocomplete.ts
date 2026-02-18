import { db } from "@/db/index.js";
import { campaigns, npcs } from "@/db/schema.js";
import { logger } from "@/logger.js";
import { BaseInteraction } from "discord.js";
import { and, eq, like } from "drizzle-orm";

export default async function handleAutocomplete(interaction: BaseInteraction) {
	if (!interaction.isAutocomplete()) return;

	const focusedOption = interaction.options.getFocused(true);

	const guildId = interaction.guild?.id;

	if (!guildId) {
		await interaction.respond([]);
		return;
	}

	try {
		if (focusedOption.name === "campaign") {
			const campaignName = focusedOption.value;

			const results = await db
				.select({
					id: campaigns.id,
					name: campaigns.name,
					dm: campaigns.dm,
				})
				.from(campaigns)
				.where(
					and(
						like(campaigns.name, `%${campaignName}%`),
						eq(campaigns.guildId, parseInt(guildId)),
					),
				)
				.limit(25);
			await interaction.respond(
				results.map((campaign) => ({
					name: campaign.name,
					value: campaign.id.toString(),
				})),
			);
		} else if (focusedOption.name === "name") {
			// For NPC name autocomplete, we need the campaign first
			const campaignValue = interaction.options.getString("campaign");
			if (!campaignValue) {
				await interaction.respond([]);
				return;
			}

			// Find the campaign
			const [campaign] = await db
				.select()
				.from(campaigns)
				.where(
					and(
						eq(campaigns.id, parseInt(campaignValue, 10)),
						eq(campaigns.guildId, parseInt(guildId)),
					),
				)
				.limit(1);

			if (!campaign) {
				await interaction.respond([]);
				return;
			}

			const npcName = focusedOption.value;

			// For removal, show existing NPCs
			const results = await db
				.select({
					id: npcs.id,
					name: npcs.name,
				})
				.from(npcs)
				.where(
					and(
						like(npcs.name, `%${npcName}%`),
						eq(npcs.campaignId, campaign.id),
					),
				)
				.limit(25);

			await interaction.respond(
				results.map((npc) => ({
					name: npc.name,
					value: npc.name,
				})),
			);
		}
	} catch (error) {
		logger.error("NPC autocomplete error:", error);
		await interaction.respond([]);
	}
}
