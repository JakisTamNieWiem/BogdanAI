// liveTranscribe.ts
import axios from "axios";
import type { Client, TextChannel } from "discord.js";
import FormData from "form-data";
import fs from "node:fs";
import path from "node:path";
import { userToCharacterMap } from "./userToCharacterMap";

const userContextMap = new Map<string, string>();
const DND_GLOSSARY =
	"D&D, RPG. Słowa: bludgeoning, piercing, slashing, stealth, rzut na percepcję, d20, obrażenia, damage, fireball, armor class, AC, check, saving throw, nat 20.";

export async function transcribeLive(
	filePath: string,
	userId: string,
	dateFolder: string,
	client: Client,
	channelId: string,
) {
	const stats = fs.statSync(filePath);
	if (stats.size < 8000) return; // Skip tiny noise files

	const form = new FormData();
	form.append("file", fs.createReadStream(filePath));
	form.append("model", "whisper-1");
	form.append("language", "pl");
	form.append("response_format", "json");

	// Whisper will use this to try and guess D&D words without an LLM!
	const previousContext = userContextMap.get(userId) || "";
	form.append("prompt", `${DND_GLOSSARY} Kontekst: ${previousContext}`);

	try {
		const whisperRes = await axios.post(
			"http://127.0.0.1:8080/inference",
			form,
			{
				headers: form.getHeaders(),
			},
		);

		const rawText = whisperRes.data.text?.trim();
		if (!rawText) return;

		userContextMap.set(userId, rawText);
		const characterName = userToCharacterMap[userId] || "Nieznany";
		const message = `**${characterName}**: ${rawText}`;
		const channel = (await client.channels.fetch(channelId)) as TextChannel;
		if (channel && channel.isTextBased()) {
			await channel.send(message);
		}

		console.log(`📝 [${characterName}]: ${rawText}`);

		// Archive the raw Whisper output
		const transcriptDir = path.join(
			process.cwd(),
			"transcriptions",
			dateFolder,
		);
		if (!fs.existsSync(transcriptDir))
			fs.mkdirSync(transcriptDir, { recursive: true });

		const baseName = path.basename(filePath);
		const jsonPath = path.join(transcriptDir, `${baseName}.json`);

		const archiveData = {
			file: baseName,
			character: characterName,
			raw_text: rawText,
			corrected_text: null, // We leave this null to be filled later by Qwen
			timestamp: Date.now(),
		};

		fs.writeFileSync(jsonPath, JSON.stringify(archiveData, null, 2));
	} catch (error) {
		console.error(
			`❌ Whisper error for ${path.basename(filePath)}:`,
			error.message,
		);
	}
}
