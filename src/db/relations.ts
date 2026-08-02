import { relations } from "drizzle-orm/relations";
import { campaigns, npcs, quests, sessions, transcriptionQueue } from "./schema";

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
	sessions: many(sessions),
	transcriptions: many(transcriptionQueue),
}));

export const npcRelations = relations(npcs, ({ one, many }) => ({
	quests: many(quests),
	campaign: one(campaigns, {
		fields: [npcs.campaignId],
		references: [campaigns.id],
	}),
}));
export const transcriptionQueueRelations = relations(
	transcriptionQueue,
	({ one }) => ({
		session: one(sessions, {
			fields: [transcriptionQueue.sessionId],
			references: [sessions.id],
		}),
		campaign: one(campaigns, {
			fields: [transcriptionQueue.campaignId],
			references: [campaigns.id],
		}),
	}),
);

export const sessionRelations = relations(sessions, ({ many, one }) => ({
	campaign: one(campaigns, {
		fields: [sessions.campaignId],
		references: [campaigns.id],
	}),
	transcriptionJobs: many(transcriptionQueue),
}));
