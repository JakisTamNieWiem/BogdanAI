import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

const sqlite = new Database(process.env.DB_FILE_NAME!);
const db = drizzle(sqlite);
const migrationsFolder = "./drizzle";

function hasTable(tableName: string) {
	const query = sqlite.query(
		"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
	);
	return query.get(tableName) !== null;
}

function getTableColumns(tableName: string) {
	return sqlite.query(`PRAGMA table_info("${tableName}")`).all() as Array<{
		name: string;
	}>;
}

function detectExistingSchemaBaseline() {
	if (!hasTable("Campaign")) {
		return -1;
	}

	if (hasTable("Session")) {
		const sessionColumns = new Set(
			getTableColumns("Session").map((column) => column.name),
		);

		if (
			sessionColumns.has("dateFolder") &&
			sessionColumns.has("transcriptionChannelId")
		) {
			return 8;
		}

		if (sessionColumns.has("sessionKey")) {
			return 10;
		}
	}

	if (hasTable("NPC")) {
		const npcColumns = new Set(
			getTableColumns("NPC").map((column) => column.name),
		);
		if (npcColumns.has("strengths")) {
			return 7;
		}
	}

	return 0;
}

function repairLegacySchemaIfNeeded() {
	if (!hasTable("Session")) {
		return;
	}

	const sessionColumns = new Set(
		getTableColumns("Session").map((column) => column.name),
	);

	if (
		sessionColumns.has("dateFolder") &&
		!sessionColumns.has("transcriptionChannelId")
	) {
		sqlite.exec(
			'ALTER TABLE "Session" ADD COLUMN "transcriptionChannelId" text',
		);
	}

	if (!sessionColumns.has("liveTranscription")) {
		sqlite.exec(
			'ALTER TABLE "Session" ADD COLUMN "liveTranscription" integer DEFAULT false NOT NULL',
		);
	}
}

function baselineExistingDatabaseIfNeeded() {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`);

	const migrationCountRow = sqlite
		.query('SELECT COUNT(*) as count FROM "__drizzle_migrations"')
		.get() as { count: number } | null;

	if ((migrationCountRow?.count ?? 0) > 0) {
		return;
	}

	const baselineIndex = detectExistingSchemaBaseline();
	if (baselineIndex < 0) {
		return;
	}

	const migrations = readMigrationFiles({ migrationsFolder });
	const migrationsToInsert = migrations.slice(0, baselineIndex + 1);

	for (const migration of migrationsToInsert) {
		sqlite
			.query(
				'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
			)
			.run(migration.hash, migration.folderMillis);
	}
}

repairLegacySchemaIfNeeded();
baselineExistingDatabaseIfNeeded();
migrate(db, { migrationsFolder });
