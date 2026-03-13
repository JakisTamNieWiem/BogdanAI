import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const MAX_CONCURRENT_WHISPERS = 3;
// Helper function to run Whisper as a Promise
function runWhisperCommand(
	folderDate: string,
	filePath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const whisper = spawn("whisper-cli", [
			"-m",
			process.env.WHISPER_MODEL!, // The model file
			"-f",
			filePath, // The target audio file
			"-oj", // Output JSON format (creates filePath.json)
			"-l",
			"pl", // Force Polish language
			"-ml",
			"32",
			"-sow",
			"-t",
			"8",
			"-nt",
			"-of",
			path.join(
				process.cwd(),
				"transcriptions",
				folderDate,
				path.basename(filePath),
			),
		]);

		// Optional: if you want to see Whisper's internal logs, uncomment these
		// whisper.stdout.on("data", (data) => console.log(`stdout: ${data}`));
		// whisper.stderr.on("data", (data) => console.error(`stderr: ${data}`));

		whisper.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Whisper exited with code ${code}`));
			}
		});

		whisper.on("error", (err) => {
			reject(err);
		});
	});
}

function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const h = hours > 0 ? `${hours}:` : "";
	const m = String(minutes).padStart(2, "0");
	const s = String(seconds).padStart(2, "0");
	return `${h}${m}:${s}`;
}

export async function transcribeSession(dateFolder: string) {
	const folderPath = path.join(process.cwd(), "recordings", dateFolder);

	if (!fs.existsSync(folderPath)) {
		console.error(`❌ Folder not found: ${folderPath}`);
		process.exit(1);
	}

	console.log(`Scanning folder: ${folderPath}`);
	const files = fs
		.readdirSync(folderPath)
		.filter((file) => file.endsWith(".ogg"))
		.sort(); // Sorts chronologically based on our HHMMSS filename format

	if (files.length === 0) {
		console.log("No audio files found.");
		return;
	}

	console.log(`Found ${files.length} audio clips.`, files);
	if (!fs.existsSync(path.join(process.cwd(), "transcriptions", dateFolder))) {
		fs.mkdirSync(path.join(process.cwd(), "transcriptions", dateFolder));
	}
	console.log(
		`Starting ${MAX_CONCURRENT_WHISPERS} concurrent Whisper workers...\n`,
	);
	let processedCount = 0;
	let failedCount = 0;
	const startTime = Date.now();
	// --- CLI PROGRESS BAR LOGIC ---
	const updateProgress = () => {
		const now = Date.now();
		const elapsedMs = now - startTime;

		let etaString = "--:--";
		if (processedCount > 0) {
			const timePerFile = elapsedMs / processedCount;
			const remainingFiles = files.length - processedCount;
			const etaMs = timePerFile * remainingFiles;
			etaString = formatTime(etaMs);
		}

		const percent = Math.floor((processedCount / files.length) * 100);

		// Clear the current terminal line and rewrite it
		process.stdout.write(
			`\r⏳ Progress:[${processedCount}/${files.length}] (${percent}%) | ⏱️ Elapsed: ${formatTime(elapsedMs)} | 🎯 ETA: ${etaString}`,
		);
	};
	const executing = new Set<Promise<void>>();
	for (const file of files) {
		const filePath = path.join(folderPath, file);

		// Create the async task
		const task = async () => {
			try {
				await runWhisperCommand(dateFolder, filePath);
				processedCount++;
			} catch (error) {
				failedCount++;
				console.error(`❌ Failed ${file}:`, error);
			} finally {
				updateProgress();
			}
		};

		// Start the task and add it to our active pool
		const promise = task().finally(() => executing.delete(promise));
		executing.add(promise);

		// If we hit our concurrency limit, wait for at least ONE task to finish before continuing the loop
		if (executing.size >= MAX_CONCURRENT_WHISPERS) {
			await Promise.race(executing);
		}
	}
	await Promise.all(executing);
	const totalElapsed = Date.now() - startTime;
	process.stdout.write("\n\n");
	console.log("========================================");
	console.log(`Whisper Processing Complete!`);
	console.log(`⏱Total Time Taken: ${formatTime(totalElapsed)}`);
	console.log(`Successfully Transcribed: ${processedCount}`);
	if (failedCount > 0) console.log(`Failed: ${failedCount}`);
	console.log("========================================");
}

// import.meta.main is a Bun feature that checks if this file was run directly from the terminal
if (import.meta.main) {
	// Grab the folder name from the command line arguments
	const targetFolder = process.argv[2];

	if (!targetFolder) {
		console.error("Please provide a date folder!");
		console.error("Example usage: bun run transcribe.ts 2026-03-03");
		process.exit(1);
	}

	console.log(`Starting transcription for session: ${targetFolder}`);

	// Run the function
	transcribeSession(targetFolder).catch((error) => {
		console.error("Transcription completely failed:", error);
		process.exit(1);
	});
}
