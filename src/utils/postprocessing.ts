import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { userToCharacterMap } from "./createListeningStream";
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

const genAI = new GoogleGenerativeAI(apiKey);
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

export async function mergeAndCorrect(dateFolder: string) {
	const folderPath = path.join(process.cwd(), "transcriptions", dateFolder);
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
		// Filename format: 193428.125-123456789.wav.json
		const baseTimeMs = parseInt(file.split("-")[0]!, 10);
		const userId = file.split("-")[1]!.split(".")[0]!;
		const speakerName = userToCharacterMap[userId] || `Unknown (${userId})`;

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
	return;
	// 3. Send the raw text to Gemini for Correction & OOC Tagging
	// We can use Gemini 1.5 Flash here because text processing is very easy for it
	console.log("🧠 Sending raw text to Gemini for summary");
	const model = genAI.getGenerativeModel({
		model: "gemini-3.1-flash-lite-preview",
	});

	const prompt = `
You are an expert fantasy storyteller, a D&D chronicler, and a master archivist. 
Below is a full transcript of our latest Dungeons & Dragons session set in modern world inspired by Jujutsu Kaisen. 
The transcript contains both in-character roleplay and [OOC] (Out-Of-Character) table talk.

Your task is to read the transcript and write a comprehensive, engaging, and epic recap of the session. 

CRITICAL INSTRUCTIONS:
1. Ignore mundane OOC chatter (e.g., "my mic is broken", "what did I roll?", "wait, hold on").
2. Focus heavily on the narrative progression, the decisions the players made, and the consequences.
3. Distinguish between what happened in the game world and the players' jokes, but embrace the fun tone of the table.
4. The output MUST be written entirely in Polish.

========================================
RAW TRANSCRIPT:
${rawTranscriptNoTimestamps}
`;

	try {
		const result = await model.generateContent(prompt);
		const finalTranscript = result.response.text();

		fs.writeFileSync(
			path.join(folderPath, "Transcript_Summary.txt"),
			finalTranscript,
		);
		console.log("Final Transcript Summary Saved!");
	} catch (err) {
		console.error("AI Summary Failed:", err);
	}
}

if (import.meta.main) {
	const targetFolder = process.argv[2];
	if (!targetFolder) process.exit(1);
	mergeAndCorrect(targetFolder);
}
