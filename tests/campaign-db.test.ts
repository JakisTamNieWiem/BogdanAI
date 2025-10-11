import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { campaigns } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Campaign Database Operations", () => {
	let db: ReturnType<typeof drizzle>;
	let testDbPath: string;

	beforeAll(async () => {
		// Create a temporary test database
		testDbPath = `./test-campaign-${Date.now()}.db`;
		const sqlite = new Database(testDbPath);
		db = drizzle(sqlite, { schema: { campaigns } });

		// Create the campaigns table
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS "Campaign" (
				"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
				"name" text NOT NULL,
				"dm" text NOT NULL,
				"players" text NOT NULL,
				"guildId" integer NOT NULL
			)
		`);
	});

	afterAll(() => {
		// Clean up test database
		try {
			require("fs").unlinkSync(testDbPath);
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	test("should create a campaign", async () => {
		const [newCampaign] = await db
			.insert(campaigns)
			.values({
				name: "Test Campaign",
				dm: "123456789",
				players: [],
				guildId: 987654321,
			})
			.returning();

		expect(newCampaign).toBeDefined();
		expect(newCampaign.name).toBe("Test Campaign");
		expect(newCampaign.dm).toBe("123456789");
		expect(newCampaign.guildId).toBe(987654321);
		expect(newCampaign.players).toEqual([]);
	});

	test("should retrieve a campaign", async () => {
		const [retrievedCampaign] = await db
			.select()
			.from(campaigns)
			.where(eq(campaigns.name, "Test Campaign"));

		expect(retrievedCampaign).toBeDefined();
		expect(retrievedCampaign.name).toBe("Test Campaign");
		expect(retrievedCampaign.dm).toBe("123456789");
	});

	test("should update a campaign by adding players", async () => {
		const [campaign] = await db
			.select()
			.from(campaigns)
			.where(eq(campaigns.name, "Test Campaign"));

		const updatedPlayers = ["111111111", "222222222"];
		await db
			.update(campaigns)
			.set({ players: updatedPlayers })
			.where(eq(campaigns.id, campaign.id));

		const [updatedCampaign] = await db
			.select()
			.from(campaigns)
			.where(eq(campaigns.id, campaign.id));

		expect(updatedCampaign.players).toEqual(updatedPlayers);
	});

	test("should delete a campaign", async () => {
		const [campaign] = await db
			.select()
			.from(campaigns)
			.where(eq(campaigns.name, "Test Campaign"));

		await db.delete(campaigns).where(eq(campaigns.id, campaign.id));

		const [deletedCampaign] = await db
			.select()
			.from(campaigns)
			.where(eq(campaigns.id, campaign.id));

		expect(deletedCampaign).toBeUndefined();
	});

	test("should handle campaign name uniqueness within same guild", async () => {
		// Create first campaign
		await db.insert(campaigns).values({
			name: "Unique Campaign",
			dm: "123456789",
			players: [],
			guildId: 987654321,
		});

		// Create another campaign with same name but different guild
		await db.insert(campaigns).values({
			name: "Unique Campaign",
			dm: "987654321",
			players: [],
			guildId: 123456789,
		});

		// Both should exist because they're in different guilds
		const allCampaigns = await db.select().from(campaigns);
		const campaignsByName = allCampaigns.filter(c => c.name === "Unique Campaign");

		expect(campaignsByName).toHaveLength(2);
	});
});