// transcribe.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from "fs";
import path from "path";
import { userToCharacterMap } from "./createListeningStream";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// Process 250 audio clips at a time (roughly 30-45 minutes of gameplay)
const BATCH_SIZE = 250;

// Helper function to pause execution and avoid Google API rate limits
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function transcribeSession(dateFolder: string) {
	const folderPath = path.join(process.cwd(), "recordings", dateFolder);
	const transcriptPath = path.join(folderPath, "Full_Transcript.txt");

	if (!fs.existsSync(folderPath)) {
		throw new Error(`Folder ${folderPath} does not exist.`);
	}

	console.log(`Scanning folder: ${folderPath}`);
	const files = fs
		.readdirSync(folderPath)
		.filter((file) => file.endsWith(".mp3"))
		.sort(); // Sorts chronologically based on our HHMMSS filename format

	if (files.length === 0) {
		console.log("No audio files found.");
		return;
	}

	console.log(
		`Found ${files.length} audio clips. Processing in batches of ${BATCH_SIZE}...`,
	);

	// Create or clear the transcript file
	fs.writeFileSync(
		transcriptPath,
		`=== D&D SESSION TRANSCRIPT: ${dateFolder} ===\n\n`,
	);

	let previousContext = "This is the very beginning of the session.";
	const model = genAI.getGenerativeModel({
		model: "gemini-3.1-flash-lite-preview",
	});

	// Process files in chunks
	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batchFiles = files.slice(i, i + BATCH_SIZE);
		const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
		const totalBatches = Math.ceil(files.length / BATCH_SIZE);

		console.log(
			`\n--- Processing Chapter ${batchNumber} of ${totalBatches} ---`,
		);

		const uploadedFiles = [];
		let timelineContext = "Timeline of clips:\n";

		// 1. Upload the current batch
		for (let j = 0; j < batchFiles.length; j++) {
			const fileName = batchFiles[j]!;
			const filePath = path.join(folderPath, fileName);

			// Extract User ID
			const userId = fileName.split("-")[1]!.replace(".mp3", "");
			const speakerName =
				userToCharacterMap[userId] || `Unknown Player (${userId})`;

			// Extract Time (e.g., "165442" -> "16:54:42")
			const timeString = fileName.split("-")[0]!;
			const formattedTime = `${timeString.slice(0, 2)}:${timeString.slice(2, 4)}:${timeString.slice(4, 6)}`;

			try {
				const uploadResponse = await fileManager.uploadFile(filePath, {
					mimeType: "audio/mp3",
					displayName: fileName,
				});

				uploadedFiles.push({
					name: uploadResponse.file.name, // We need this later to delete the file
					fileData: {
						mimeType: uploadResponse.file.mimeType,
						fileUri: uploadResponse.file.uri,
					},
				});

				timelineContext += `Clip ${j + 1} starts at [${formattedTime}]: Spoken by ${speakerName}\n`;
			} catch (err) {
				console.error(`Failed to upload ${fileName}:`, err);
			}

			// Small delay to prevent spamming the upload endpoint
			await delay(200);
		}

		// 2. Generate Transcript for this batch
		const prompt = `
You are transcribing Chapter ${batchNumber} of a D&D session. 
You are receiving ${uploadedFiles.length} short audio clips in chronological order.

PREVIOUS CONTEXT (What happened just before this):
"${previousContext}"

${timelineContext}

CRITICAL INSTRUCTIONS:
1. You MUST format EVERY SINGLE LINE of dialogue using this exact structure:
   [HH:MM:SS] Speaker Name: "The dialogue..."
2. Match the dialogue to the correct timestamp provided in the CURRENT CLIP TIMELINE.
3. IN-CHARACTER VS OUT-OF-CHARACTER: Pay close attention to whether the players are roleplaying or talking out-of-game (e.g., discussing rules, rolling dice, joking, or talking about real life). 
   - If they are Out-Of-Character, add [OOC] next to their name. 
   - Example: [16:54:42] Frodo [OOC]: "Wait, what did I roll for damage?"
4. If a clip contains music, sound effects, or background noise without speech, format it like this:
   [HH:MM:SS] [Sound effect / Music description]
5. The DM plays multiple characters. Deduce which NPC they are playing based on voice, tone, and context. Format their name as:
   [HH:MM:SS] DM (Character Name): "The dialogue..."
   - If the DM is explaining rules or talking out-of-game, format as: [HH:MM:SS] DM [OOC]: "Make a dexterity saving throw."
6. Do not summarize or write in paragraphs. This must look like a professional chat log or script.
`;

		console.log(
			`Generating transcript for Chapter ${batchNumber}... (This might take a minute)`,
		);

		try {
			// Extract just the fileData objects for the Gemini prompt
			const geminiPayload = uploadedFiles.map((f) => ({
				fileData: f.fileData,
			}));

			const result = await model.generateContent([prompt, ...geminiPayload]);
			const transcriptText = result.response.text();

			// Append this batch's text to the main file
			fs.appendFileSync(
				transcriptPath,
				`\n\n--- CHAPTER ${batchNumber} ---\n\n` + transcriptText,
			);
			console.log(`Chapter ${batchNumber} appended to transcript!`);

			// Update the context for the next batch using the last ~500 characters of this transcript
			// so the AI remembers the current scene, active NPCs, and conversation topic.
			previousContext = transcriptText.slice(-500);
		} catch (err) {
			console.error(
				`Error generating transcript for Chapter ${batchNumber}:`,
				err,
			);
			fs.appendFileSync(
				transcriptPath,
				`\n\n[ERROR: Failed to generate Chapter ${batchNumber}]\n\n`,
			);
		}

		// 3. CLEANUP: Delete the files from Google's servers to save Quota
		console.log(
			`Cleaning up ${uploadedFiles.length} files from Google Cloud...`,
		);
		for (const file of uploadedFiles) {
			try {
				await fileManager.deleteFile(file.name);
			} catch (e) {
				// Ignore cleanup errors
			}
		}

		// Cool down the API before the next massive batch
		if (batchNumber < totalBatches) {
			console.log("Cooling down for 15 seconds to respect API rate limits...");
			await delay(15000);
		}
	}

	console.log(
		`\n✅ Session Transcription Complete! Saved to: ${transcriptPath}`,
	);
}

// import.meta.main is a Bun feature that checks if this file was run directly from the terminal
if (import.meta.main) {
	// Grab the folder name from the command line arguments
	const targetFolder = process.argv[2];

	if (!targetFolder) {
		console.error("❌ Please provide a date folder!");
		console.error("💡 Example usage: bun run transcribe.ts 2026-03-03");
		process.exit(1);
	}

	console.log(`🚀 Starting transcription for session: ${targetFolder}`);

	// Run the function
	transcribeSession(targetFolder).catch((error) => {
		console.error("Transcription completely failed:", error);
		process.exit(1);
	});
}
