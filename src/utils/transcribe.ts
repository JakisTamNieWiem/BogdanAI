import fs from "fs";
import path from "path";

const MAX_CONCURRENT_WHISPERS = 3;
const MIN_AUDIO_FILE_SIZE_BYTES = 8000;

type WhisperSegment = {
	text?: string;
	start?: number;
	end?: number;
};

function buildArchivePayload(responseData: {
	text?: unknown;
	language?: unknown;
	segments?: WhisperSegment[];
}) {
	const segments = Array.isArray(responseData.segments)
		? responseData.segments
		: [];

	return {
		text: typeof responseData.text === "string" ? responseData.text : "",
		language:
			typeof responseData.language === "string" ? responseData.language : "pl",
		segments,
		transcription: segments.map((segment) => ({
			text: segment.text ?? "",
			offsets: {
				from: Math.round((segment.start ?? 0) * 1000),
				to: Math.round((segment.end ?? segment.start ?? 0) * 1000),
			},
		})),
	};
}

async function runWhisperCommand(
	folderDate: string,
	filePath: string,
): Promise<void> {
	const whisperUrl =
		process.env.WHISPER_SERVER_URL ?? "http://127.0.0.1:8080/inference";

	const form = new FormData();
	form.append("file", Bun.file(filePath), path.basename(filePath));
	form.append("model", "whisper-1");
	form.append("language", "pl");
	form.append("response_format", "verbose_json");

	const response = await fetch(whisperUrl, {
		method: "POST",
		body: form,
		signal: AbortSignal.timeout(10 * 60 * 1000),
	});
	if (!response.ok) {
		throw new Error(
			`Whisper server responded with ${response.status} ${response.statusText}`,
		);
	}
	const responseData = await response.json();

	const transcriptDir = path.join(folderDate, "transcripts");
	fs.mkdirSync(transcriptDir, { recursive: true });

	const outputPath = path.join(
		transcriptDir,
		`${path.basename(filePath)}.json`,
	);
	const archivePayload = buildArchivePayload(responseData ?? {});
	fs.writeFileSync(outputPath, JSON.stringify(archivePayload, null, 2));
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
	const sessionsPath = path.join(process.cwd(), "sessions");
	const sessions = fs.readdirSync(sessionsPath);
	const folderName = sessions.find((f) => f.startsWith(dateFolder));

	if (!folderName) {
		throw new Error(`Folder not found: ${folderName}`);
	}

	const folderPath = path.join(sessionsPath, folderName, "audio");
	if (!fs.existsSync(folderPath)) {
		throw new Error(`Folder not found: ${folderPath}`);
	}

	console.log(`Scanning folder: ${folderPath}`);
	const skippedTinyFiles: string[] = [];
	const files = fs
		.readdirSync(folderPath)
		.filter((file) => {
			if (!file.endsWith(".wav")) {
				return false;
			}

			const filePath = path.join(folderPath, file);
			const stats = fs.statSync(filePath);
			if (stats.size < MIN_AUDIO_FILE_SIZE_BYTES) {
				skippedTinyFiles.push(file);
				return false;
			}

			return true;
		})
		.sort((a, b) => {
			const partA = a.split("-")[0];
			const partB = b.split("-")[0];

			if (!partA || !partB) {
				return a.localeCompare(b);
			}

			const numA = parseInt(partA, 10);
			const numB = parseInt(partB, 10);

			const isANaN = isNaN(numA);
			const isBNaN = isNaN(numB);

			// If both prefixes are not valid numbers, fall back to alphabetical comparison
			if (isANaN && isBNaN) {
				return a.localeCompare(b);
			}

			// Move filenames without valid leading numbers to the end
			if (isANaN) return 1;
			if (isBNaN) return -1;

			// Sort numerically
			if (numA !== numB) {
				return numA - numB;
			}

			// Secondary sort alphabetically if the leading numbers are identical
			return a.localeCompare(b);
		});

	if (files.length === 0) {
		console.log("No .wav audio files found.");
		if (skippedTinyFiles.length > 0) {
			console.log(
				`Skipped ${skippedTinyFiles.length} tiny audio files under ${MIN_AUDIO_FILE_SIZE_BYTES} bytes.`,
			);
		}
		return;
	}

	console.log(`Found ${files.length} audio clips.`, files);
	if (skippedTinyFiles.length > 0) {
		console.log(
			`Skipped ${skippedTinyFiles.length} tiny audio files under ${MIN_AUDIO_FILE_SIZE_BYTES} bytes.`,
		);
	}
	fs.mkdirSync(path.join(process.cwd(), "transcriptions", dateFolder), {
		recursive: true,
	});
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
				await runWhisperCommand(path.join(sessionsPath, folderName), filePath);
				processedCount++;
			} catch (error) {
				failedCount++;
				console.error(`\n❌ Failed ${file}:`, error);
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
