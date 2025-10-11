// scripts/seed.ts

import { drizzle } from "drizzle-orm/bun-sqlite";
import { LoremIpsum } from "lorem-ipsum";
import { parseArgs } from "node:util";

// Adjust the path to your Drizzle schema file
import spells from "@data/spells.json" with { type: "json" };
import wikidot_spells from "@data/wikidot-spells.json" with { type: "json" };
import * as schema from "./schema";

// --- Database Setup ---
// Adjust the path to your SQLite database file
export const db = drizzle({
	connection: { source: process.env.DB_FILE_NAME! },
});

// --- Seeding Utilities ---
const options = {
	table: { type: "string" } as const,
};
const lorem = new LoremIpsum({
	wordsPerSentence: {
		min: 3,
		max: 10,
	},
});

// --- Main Seeding Logic ---
async function main() {
	const {
		values: { table },
	} = parseArgs({ options });

	console.log(`Starting seed for: ${table || "all tables"}`);

	switch (table) {
		case "npc": {
			await seed_npc();
			break;
		}
		case "quest": {
			// Quests depend on a campaign existing first
			await seed_campaign();
			await seed_quest();
			break;
		}
		case "spell": {
			await seed_spell();
			break;
		}
		default: {
			await seed_spell();
			await seed_campaign();
			await seed_quest();
			await seed_npc();
			break;
		}
	}
}

// --- Table-specific Seeding Functions ---

async function seed_spell() {
	console.log("Seeding spells...");
	const spellData = spells.concat(wikidot_spells).map((spell) => {
		return {
			name: spell.name,
			type: spell.type,
			casting_time: spell.casting_time,
			range: spell.range,
			components: spell.components.raw,
			duration: spell.duration,
			description: spell.description,
			higher_levels: spell.higher_levels ?? null, // Ensure undefined becomes null
			classes: spell.classes,
		};
	});

	// De-duplicate spells by name, keeping the first one found
	const uniqueSpells = Object.values(
		spellData.reduce(
			(acc, current) => {
				if (!acc[current.name]) {
					acc[current.name] = current;
				}
				return acc;
			},
			{} as Record<string, (typeof spellData)[0]>,
		),
	);

	if (uniqueSpells.length > 0) {
		await db
			.insert(schema.spells)
			.values(uniqueSpells)
			// This is Drizzle's equivalent of `skipDuplicates: true` for unique constraints
			.onConflictDoNothing();
		console.log(`Seeded ${uniqueSpells.length} unique spells.`);
	} else {
		console.log("No new spells to seed.");
	}
}

async function seed_quest() {
	console.log("Seeding quests...");
	const data = Array.from({ length: 10 }, () => {
		return {
			name: lorem.generateWords(2),
			campaignId: 1, // Assumes a campaign with id=1 exists
			description: lorem.generateSentences(3).split(". "),
			shortDesc: lorem.generateWords(3),
			rewards: lorem.generateWords(3),
			location: lorem.generateWords(1),
			// Drizzle's `better-sqlite3` driver handles boolean-to-integer conversion
			active: true,
		};
	});

	await db.insert(schema.quests).values(data);
	console.log("Seeded 10 quests.");
}

async function seed_campaign() {
	console.log("Seeding campaign...");
	// Using onConflictDoNothing to prevent errors if you re-run the full seed
	await db
		.insert(schema.campaigns)
		.values({
			id: 1, // Explicitly set ID for predictable relations
			name: "Test Campaign",
			dm: "The DM",
			players: ["player_one", "player_two"],
			guildId: 0,
		})
		.onConflictDoNothing();
	console.log("Seeded campaign with ID 1.");
}

async function seed_npc() {
	console.log("Seeding NPCs...");
	const data = Array.from({ length: 10 }, () => {
		return {
			name: lorem.generateWords(2),
			description: lorem.generateSentences(1),
			campaignId: 1, // Assumes a campaign with id=1 exists
			portrait: "", // Portrait as an empty string
		};
	});

	await db.insert(schema.npcs).values(data);
	console.log("Seeded 10 NPCs.");
}

// --- Script Execution ---
main()
	.then(() => {
		console.log("✅ Seeding complete!");
		process.exit(0);
	})
	.catch((e) => {
		console.error("❌ Seeding failed:");
		console.error(e);
		process.exit(1);
	});
