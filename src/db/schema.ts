import { relations } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const spells = sqliteTable("Spell", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").unique().notNull(),
	type: text("type").notNull(),
	casting_time: text("casting_time").notNull(),
	range: text("range").notNull(),
	components: text("components").notNull(),
	duration: text("duration").notNull(),
	description: text("description").notNull(),
	higher_levels: text("higher_levels"),
	source: text("source").default("Player's Handbook").notNull(),
	classes: text("classes", { mode: "json" }).$type<string[]>().notNull(),
});

export const quests = sqliteTable(
	"Quest",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		campaignId: integer("campaignId")
			.notNull()
			.references(() => campaigns.id, { onDelete: "cascade" }),
		NPCId: integer("NPCId").references(() => npcs.id, { onDelete: "set null" }),
		description: text("description", { mode: "json" })
			.$type<string[]>()
			.notNull(),
		shortDesc: text("shortDesc").notNull(),
		level: integer("level").default(1).notNull(),
		location: text("location").notNull(),
		rewards: text("rewards").notNull(),
		active: integer("active", { mode: "boolean" }).default(true).notNull(),
	},
	(table) => [
		uniqueIndex("Quest_campaignId_name_unique").on(
			table.campaignId,
			table.name,
		),
	],
);

export const campaigns = sqliteTable("Campaign", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	description: text("description"),
	dm: text("dm").notNull(), // Discord user ID of the DM
	players: text("players", { mode: "json" }).$type<string[]>().notNull(), // Array of Discord user IDs
	guildId: integer("guildId").notNull(), // Discord guild ID
});

export const npcs = sqliteTable(
	"NPC",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		description: text("description")
			.notNull()
			.default("No description provided."),
		strengths: text("strengths"),
		weaknesses: text("weaknesses"),
		note: text("note"),
		portrait: text("portrait"),
		campaignId: integer("campaignId")
			.notNull()
			.references(() => campaigns.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("NPC_campaignId_name_unique").on(table.campaignId, table.name),
	],
);

export const playerCharacters = sqliteTable("PlayerCharacter", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	owner: text("owner").notNull(),
	name: text("name").notNull(),
	class: text("class").$type<Class>().notNull(),
	level: integer("level").default(1).notNull(),
	stats: text("stats", { mode: "json" })
		.$type<number[]>()
		.default([10, 10, 10, 10, 10, 10])
		.notNull(),
	proficiency: text("proficiency", { mode: "json" }).$type<Skill[]>().notNull(),
	expertise: text("expertise", { mode: "json" }).$type<Skill[]>().notNull(),
});

export type Class =
	| "Barbarian"
	| "Bard"
	| "Cleric"
	| "Druid"
	| "Fighter"
	| "Monk"
	| "Paladin"
	| "Ranger"
	| "Rogue"
	| "Sorcerer"
	| "Warlock"
	| "Wizard";

export type Skill =
	| "Acrobatics"
	| "AnimalHandling"
	| "Arcana"
	| "Athletics"
	| "Deception"
	| "History"
	| "Insight"
	| "Intimidation"
	| "Investigation"
	| "Medicine"
	| "Nature"
	| "Perception"
	| "Performance"
	| "Persuasion"
	| "Religion"
	| "Stealing"
	| "Stealth"
	| "Survival";

export const campaignRelations = relations(campaigns, ({ many }) => ({
	quests: many(quests),
	npcs: many(npcs),
}));

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

export const npcRelations = relations(npcs, ({ one, many }) => ({
	campaign: one(campaigns, {
		fields: [npcs.campaignId],
		references: [campaigns.id],
	}),
	quests: many(quests),
}));
