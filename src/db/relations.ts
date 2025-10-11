import { relations } from "drizzle-orm/relations";
import { campaigns, npcs, quests } from "./schema";

export const questRelations = relations(quests, ({ one }) => ({
	campaign: one(campaigns, {
		fields: [quests.campaignId],
		references: [campaigns.id],
	}),
	npc: one(npcs, {
		fields: [quests.NPCId],
		references: [npcs.id],
	}),
}));

export const campaignRelations = relations(campaigns, ({ many }) => ({
	quests: many(quests),
	npcs: many(npcs),
}));

export const npcRelations = relations(npcs, ({ one, many }) => ({
	quests: many(quests),
	campaign: one(campaigns, {
		fields: [npcs.campaignId],
		references: [campaigns.id],
	}),
}));
