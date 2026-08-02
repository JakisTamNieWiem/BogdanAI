import { mergeTranscriptions } from "../src/utils/postprocessing.ts";

async function main() {
	const targetFolders = process.argv.slice(2);

	if (targetFolders.length === 0) {
		console.error("Please provide at least one transcription folder.");
		console.error(
			"Example usage: bun run merge-transcripts 2026-03-29 2026-03-30",
		);
		process.exit(1);
	}

	for (const folder of targetFolders) {
		console.log(`\n=== Merging transcription folder: ${folder} ===`);
		await mergeTranscriptions(folder);
	}

	console.log("\nAll requested merge jobs completed.");
}

main().catch((error) => {
	console.error("Merge run failed:", error);
	process.exit(1);
});
