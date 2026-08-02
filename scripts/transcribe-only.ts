import { transcribeSession } from "../src/utils/transcribe.ts";

async function main() {
	const targetFolders = process.argv.slice(2);

	if (targetFolders.length === 0) {
		console.error("Please provide at least one recording folder.");
		console.error(
			"Example usage: bun run transcribe 2026-03-03 2026-03-10",
		);
		process.exit(1);
	}

	for (const folder of targetFolders) {
		console.log(`\n=== Transcribing folder: ${folder} ===`);
		await transcribeSession(folder);
	}

	console.log("\nAll requested transcriptions completed.");
}

main().catch((error) => {
	console.error("Transcription run failed:", error);
	process.exit(1);
});
