import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { userToCharacterMapNewYork } from "./userToCharacterMap";

// Helper: Convert total milliseconds back to [HH:MM:SS.mmm]
function formatTimeFromMs(totalMs: number): string {
	const d = new Date(totalMs);
	// We use UTC so timezone offsets don't mess up our math
	const h = String(d.getUTCHours()).padStart(2, "0");
	const m = String(d.getUTCMinutes()).padStart(2, "0");
	const s = String(d.getUTCSeconds()).padStart(2, "0");
	const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
	return `[${h}:${m}:${s}.${ms}]`;
}

interface DialogueLine {
	absoluteMs: number;
	formattedTime: string;
	speaker: string;
	text: string;
}

function getTranscriptionFolderPath(dateFolder: string) {
	return path.join(process.cwd(), "transcriptions", dateFolder);
}

function getSummaryPrompt(transcript: string) {
	return `
You are a careful tabletop-RPG chronicler.
Read the transcript below and write a structured Polish session summary.

Rules:
- Focus on in-character events, decisions, discoveries, combat, clues, and consequences.
- Ignore mundane table chatter unless it matters to play.
- Mention unresolved hooks and important follow-up leads.
- Keep the tone readable and useful for players returning next session.

Transcript:
${transcript}
`.trim();
}

function runLlamaSummary(promptFilePath: string) {
	return new Promise<string>((resolve, reject) => {
		const llamaCliPath = process.env.LLAMA_CLI_PATH ?? "llama-cli";
		const llamaModel = process.env.LLAMA_MODEL;
		if (!llamaModel) {
			reject(new Error("Missing LLAMA_MODEL environment variable."));
			return;
		}

		const args = [
			"-m",
			llamaModel,
			"-f",
			promptFilePath,
			"-n",
			process.env.LLAMA_MAX_TOKENS ?? "1024",
			"-c",
			process.env.LLAMA_CONTEXT_SIZE ?? "8192",
			"--temp",
			process.env.LLAMA_TEMPERATURE ?? "0.2",
		];

		const child = spawn(llamaCliPath, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout.trim());
				return;
			}

			reject(
				new Error(
					`llama.cpp exited with code ${code}. ${stderr.trim() || "No stderr output."}`,
				),
			);
		});
	});
}

export async function mergeTranscriptions(dateFolder: string) {
	const sessionsPath = path.join(process.cwd(), "sessions");
	const sessions = fs.readdirSync(sessionsPath);
	const folderName = sessions.find((f) => f.startsWith(dateFolder));

	if (!folderName) {
		throw new Error(`Folder not found: ${folderName}`);
	}

	const folderPath = path.join(sessionsPath, folderName, "transcripts");
	if (!fs.existsSync(folderPath)) {
		throw new Error(`Folder not found: ${folderPath}`);
	}
	const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".json"));

	if (files.length === 0) return console.log("No Whisper JSON files found.");

	const allDialogue: DialogueLine[] = [];

	console.log(
		"🧩 Parsing Whisper JSON files and calculating absolute timestamps...",
	);

	// 1. Parse every JSON file and calculate the exact wall-clock time of every word
	for (const file of files) {
		const filePath = path.join(folderPath, file);

		// Extract base time and user
		// Filename format: 1-1779475372459-877572265707970560.wav.json
		const baseTimeMs = parseInt(file.split("-")[1]!, 10);
		const userId = file.split("-")[2]!.split(".")[0]!;
		const speakerName = userToCharacterMapNewYork[userId] || `Unknown (${userId})`;

		// Read Whisper JSON output
		const rawData = fs.readFileSync(filePath, "utf-8");
		const whisperData = JSON.parse(rawData);

		// whisper.cpp puts segments inside the "transcription" array.
		// "offsets.from" is usually in milliseconds from the start of the audio clip.
		const segments = whisperData.transcription || whisperData.segments || [];

		for (const segment of segments) {
			// Get relative offset (e.g., this word was spoken 1500ms into the clip)
			const relativeStartMs = segment.offsets?.from ?? segment.t0 * 10;

			// Calculate Absolute Time
			const absoluteMs = baseTimeMs + relativeStartMs;

			allDialogue.push({
				absoluteMs,
				formattedTime: formatTimeFromMs(absoluteMs),
				speaker: speakerName,
				text: segment.text.trim(),
			});
		}
	}

	// 2. Sort EVERYTHING chronologically
	allDialogue.sort((a, b) => a.absoluteMs - b.absoluteMs);

	// Create a raw transcript
	let rawTranscript = "";
	for (const line of allDialogue) {
		rawTranscript += `${line.formattedTime} ${line.speaker}: ${line.text}\n`;
	}

	fs.writeFileSync(
		path.join(folderPath, "Raw_Whisper_Timeline.txt"),
		rawTranscript,
	);
	console.log("✅ Raw timeline merged and saved!");
	const rawTranscriptNoTimestamps = rawTranscript.replace(/^\[.*\] /gm, "");
	fs.writeFileSync(
		path.join(folderPath, "Raw_Whisper_Transcript.txt"),
		rawTranscriptNoTimestamps,
	);
	console.log("✅ Raw transcript merged and saved!");
}

export async function summarizeTranscriptions(dateFolder: string) {
	const folderPath = getTranscriptionFolderPath(dateFolder);
	if (!fs.existsSync(folderPath)) {
		throw new Error(`Folder not found: ${folderPath}`);
	}

	const transcriptPath = path.join(folderPath, "Raw_Whisper_Transcript.txt");
	if (!fs.existsSync(transcriptPath)) {
		throw new Error(
			`Merged transcript not found: ${transcriptPath}. Run merge-transcripts first.`,
		);
	}

	const transcript = fs.readFileSync(transcriptPath, "utf-8").trim();
	if (!transcript) {
		throw new Error(`Merged transcript is empty: ${transcriptPath}`);
	}

	const prompt = getSummaryPrompt(transcript);
	const promptPath = path.join(folderPath, "Summary_Prompt.txt");
	fs.writeFileSync(promptPath, prompt);

	console.log("🧠 Generating local summary with llama.cpp...");
	const summary = await runLlamaSummary(promptPath);
	fs.writeFileSync(path.join(folderPath, "Transcript_Summary.txt"), summary);
	console.log("✅ Transcript summary saved!");
}

if (import.meta.main) {
	const targetFolder = process.argv[2];
	if (!targetFolder) process.exit(1);
	mergeTranscriptions(targetFolder).catch((error) => {
		console.error("Post-processing failed:", error);
		process.exit(1);
	});
}
