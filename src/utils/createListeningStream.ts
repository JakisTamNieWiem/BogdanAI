import { EndBehaviorType, type VoiceReceiver } from "@discordjs/voice";
import { spawn } from "child_process";
import type { User } from "discord.js";
import fs from "fs";
import OpusScript from "opusscript"; // Imports the new WASM decoder
import path from "path";

export const userToCharacterMap: Record<string, string> = {
	"298520910430863363": "Judasz",
	"350942764407717888": "Ibrahim",
	"403602142046453762": "Jakub",
	"713455223179575387": "Jimmy",
	"877572265707970560": "Ignacy",
	"427920650141958164": "DM-1",
	"375337551856402444": "DM-2",
	"501009127657701376": "Jyndrek",
	"441699742788091930": "Hektor",
	"647861193620324392": "Hoshi",
	"503986482156011530": "Yami",
};

// A global Set to track users who are CURRENTLY being recorded.
// This prevents multiple FFmpeg/WASM instances from spawning for the same user.
const activeRecordings = new Set<string>();

export async function createListeningStream(
	receiver: VoiceReceiver,
	user: User,
) {
	// 1. If we are already recording this user, do not spawn another stream!
	if (activeRecordings.has(user.id)) {
		return;
	}

	// Mark user as actively recording
	activeRecordings.add(user.id);

	const opusStream = receiver.subscribe(user.id, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			// You can increase this to 3000 (3s) or 5000 (5s) if you want
			// fewer split files when people take long pauses between sentences.
			duration: 10000,
		},
	});

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	const seconds = String(now.getSeconds()).padStart(2, "0");

	const folderName = `${year}-${month}-${day}`;
	const folderPath = path.join(process.cwd(), "recordings", folderName);

	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}

	const fileName = `${hours}${minutes}${seconds}-${user.id}.mp3`;
	const filePath = path.join(folderPath, fileName);

	const decoder = new OpusScript(48_000, 2, OpusScript.Application.AUDIO);

	// A safety flag to prevent WASM decoding after memory is freed
	let isDestroyed = false;

	const ffmpeg = spawn("ffmpeg", [
		"-f",
		"s16le", // Input format: PCM 16-bit
		"-ar",
		"48000", // Input sample rate: 48 kHz
		"-ac",
		"2", // Input channels: Stereo
		"-i",
		"pipe:0", // Read from stdin
		"-c:a",
		"libmp3lame", // Audio codec: MP3
		"-b:a",
		"128k", // Bitrate: 128 kbps (Excellent quality for voice)
		"-f",
		"mp3", // Output format: MP3
		"-y", // Overwrite
		filePath,
	]);

	ffmpeg.stdin.on("error", (err) => {
		// Suppress FFmpeg pipe closure errors that happen naturally on end
		// biome-ignore lint/suspicious/noExplicitAny: Nie wiem jaki typ lool
		if ((err as any).code !== "EPIPE") {
			console.error(`FFmpeg stdin error: ${err.message}`);
		}
	});

	console.log(`Started recording ${filePath}`);

	opusStream.on("data", (chunk) => {
		// Prevent decoding if memory is freed, or if Discord sends an empty packet
		if (isDestroyed || !chunk || chunk.length === 0) return;

		try {
			const pcmBuffer = decoder.decode(chunk);
			ffmpeg.stdin.write(pcmBuffer);
		} catch (error) {
			console.error(
				`Error decoding Opus packet for ${user.username}: ${(error as Error).message}`,
			);
		}
	});

	// A helper function to safely clean up WASM and Streams once
	const cleanup = () => {
		if (isDestroyed) return;
		isDestroyed = true;

		// Remove the user from the lock so they can be recorded again next time they speak
		activeRecordings.delete(user.id);

		try {
			// Safely delete WebAssembly memory
			decoder.delete();
		} catch (e) {}

		try {
			// Tell FFmpeg to wrap up and save the file
			ffmpeg.stdin.end();
		} catch (e) {}
	};

	opusStream.on("end", () => {
		console.log(
			`Finished receiving audio from ${user.username}, finalizing ${filePath}`,
		);
		cleanup();
	});

	opusStream.on("error", (err) => {
		console.error(`Opus stream error for ${user.username}: ${err.message}`);
		cleanup();
	});

	ffmpeg.on("close", (code) => {
		if (code === 0) {
			console.log(`Successfully recorded ${filePath}`);
		} else {
			console.warn(
				`FFmpeg closed with error code ${code} for file ${filePath}`,
			);
		}
	});
}
