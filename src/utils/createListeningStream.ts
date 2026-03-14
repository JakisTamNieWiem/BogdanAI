import { EndBehaviorType, type VoiceReceiver } from "@discordjs/voice";
import { type ChildProcess, spawn } from "child_process";
import type { User } from "discord.js";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------
// 🚀 THE IMMORTAL OGG MULTIPLEXER 🚀
// Completely replaces `opusscript`. Wraps raw Discord audio
// into Ogg pages so FFmpeg can safely decode it natively!
// ---------------------------------------------------------

// OGG-SPECIFIC CRC32 Checksum Table (Polynomial 0x04C11DB7)
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let r = i << 24;
	for (let j = 0; j < 8; j++) {
		r = (r & 0x80000000) !== 0 ? (r << 1) ^ 0x04c11db7 : r << 1;
	}
	crc32Table[i] = r >>> 0;
}

function calculateCrc32(buffer: Buffer): number {
	// Ogg CRC starts at 0, not 0xFFFFFFFF
	let crc = 0;
	for (let i = 0; i < buffer.length; i++) {
		crc = ((crc << 8) >>> 0) ^ crc32Table[((crc >>> 24) ^ buffer[i]!) & 0xff]!;
	}
	return crc >>> 0;
}

class OggOpusMultiplexer {
	private pageSeq = 0;
	private granule = 0;
	private serial = Math.floor(Math.random() * 0xffffffff);

	public createHeaders(): Buffer {
		const opusHead = Buffer.alloc(19);
		opusHead.write("OpusHead", 0);
		opusHead.writeUInt8(1, 8); // Version
		opusHead.writeUInt8(2, 9); // Channels (Stereo)
		opusHead.writeUInt16LE(3840, 10); // Pre-skip
		opusHead.writeUInt32LE(48000, 12); // Sample rate
		opusHead.writeUInt16LE(0, 16); // Gain
		opusHead.writeUInt8(0, 18); // Channel mapping

		const opusTags = Buffer.from(
			"OpusTags\x08\x00\x00\x00Overseer\x00\x00\x00\x00",
			"binary",
		);

		return Buffer.concat([
			this.createPage(opusHead, 0x02, 0), // 0x02 = Beginning of Stream
			this.createPage(opusTags, 0x00, 0),
		]);
	}

	private createPage(
		packet: Buffer,
		headerType: number,
		granulePos: number,
	): Buffer {
		let remaining = packet.length;
		const segments: number[] = [];
		while (remaining >= 255) {
			segments.push(255);
			remaining -= 255;
		}
		segments.push(remaining);
		const segmentTable = Buffer.from(segments);

		const header = Buffer.alloc(27 + segmentTable.length);
		header.write("OggS", 0);
		header.writeUInt8(0, 4);
		header.writeUInt8(headerType, 5);

		header.writeUInt32LE(granulePos & 0xffffffff, 6);
		header.writeUInt32LE(Math.floor(granulePos / 0x100000000), 10);

		header.writeUInt32LE(this.serial, 14);
		header.writeUInt32LE(this.pageSeq++, 18);
		header.writeUInt32LE(0, 22);
		header.writeUInt8(segmentTable.length, 26);
		segmentTable.copy(header, 27);

		const page = Buffer.concat([header, packet]);
		page.writeUInt32LE(calculateCrc32(page), 22);

		return page;
	}

	public writePacket(packet: Buffer): Buffer {
		this.granule += 960; // 20ms of audio at 48kHz
		return this.createPage(packet, 0x00, this.granule);
	}
	// NEW: Closes the Ogg stream cleanly so FFmpeg doesn't think it's corrupted
	public writeEndStream(): Buffer {
		// 0x04 is the End of Stream (EOS) flag in Ogg
		return this.createPage(Buffer.alloc(0), 0x04, this.granule);
	}
}
// ---------------------------------------------------------

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

export const userToCharacterMapWarhammer: Record<string, string> = {
	"298520910430863363": "Abramo",
	"403602142046453762": "Dante",
	"375337551856402444": "Matteo",
	"441699742788091930": "Vittorio",
	"1261710322100605011": "DM",
};

// --- ANTI-ZOMBIE PROCESS SYSTEM ---
const activeFfmpegProcesses = new Set<ChildProcess>();

export const killAllFfmpeg = () => {
	for (const ffmpeg of activeFfmpegProcesses) {
		try {
			ffmpeg.kill("SIGKILL");
		} catch (e) {}
	}
};

process.on("exit", killAllFfmpeg);
process.on("SIGINT", () => {
	killAllFfmpeg();
	process.exit(0);
});
process.on("SIGTERM", () => {
	killAllFfmpeg();
	process.exit(0);
});
process.on("uncaughtException", (err) => {
	console.error("Uncaught exception, shutting down:", err);
	killAllFfmpeg();
	process.exit(1);
});

export const activeRecordings = new Set<string>();

export async function createListeningStream(
	receiver: VoiceReceiver,
	user: User,
) {
	if (activeRecordings.has(user.id)) return;

	activeRecordings.add(user.id);

	const opusStream = receiver.subscribe(user.id, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: 5000,
		},
	});

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");

	const folderName = `${year}-${month}-${day}`;
	const folderPath = path.join(process.cwd(), "recordings", folderName);

	if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

	const fileName = `${now.getTime()}-${user.id}.mp3`;
	const filePath = path.join(folderPath, fileName);

	let isDestroyed = false;
	const ffmpeg = spawn("ffmpeg", [
		"-f",
		"ogg", // Input is the multiplexed Ogg stream
		"-i",
		"pipe:0", // Read from stdin
		"-ar",
		"48000", // Output Sample Rate: 48 kHz
		"-ac",
		"2", // Output Channels: Stereo
		"-c:a",
		"libopus", // Audio codec: Opus (high compression, small file)
		"-b:a",
		"64k", // 64kbps is perfect for Ogg/Opus voice (very small)
		"-f",
		"ogg", // Output format: Ogg container
		"-y", // Overwrite
		filePath,
	]);

	activeFfmpegProcesses.add(ffmpeg);

	let ffmpegLogs = "";
	ffmpeg.stderr.on("data", (data: Buffer) => {
		// Capture the last ~3000 characters of FFmpeg's internal logs
		ffmpegLogs += data.toString();
		if (ffmpegLogs.length > 3000)
			ffmpegLogs = ffmpegLogs.substring(ffmpegLogs.length - 3000);
	});

	console.log(`Started recording ${filePath}`);
	// Spin up a fresh Ogg Multiplexer for this recording session
	const muxer = new OggOpusMultiplexer();
	let validPacketsWritten = 0; // 2. Track if they actually spoke!

	// Inject the mandatory Opus headers into FFmpeg before sending audio
	ffmpeg.stdin.write(muxer.createHeaders());
	try {
		ffmpeg.stdin.write(muxer.createHeaders());
	} catch (e) {
		console.error(`Error writing headers to FFmpeg: ${e}`);
	}
	opusStream.on("data", (chunk: Buffer) => {
		if (isDestroyed || !chunk) return;

		if (chunk.length < 10) return;

		try {
			ffmpeg.stdin.write(muxer.writePacket(chunk));
			validPacketsWritten++; // Log that we successfully wrote real audio
		} catch (error) {
			console.error(`Error writing Ogg frame: ${(error as Error).message}`);
		}
	});

	const cleanup = () => {
		if (isDestroyed) return;
		isDestroyed = true;

		activeRecordings.delete(user.id);

		try {
			// Send the clean End-of-Stream flag
			ffmpeg.stdin.write(muxer.writeEndStream());
			// Close the pipe
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
		activeFfmpegProcesses.delete(ffmpeg);

		if (code === 0) {
			console.log(`Successfully recorded ${filePath}`);
		}
		// 3. Prevent the "Zero-Audio Crash" from spamming your console
		else if (validPacketsWritten === 0) {
			console.log(
				`[IGNORE] Deleted ${filePath} because it contained no actual audio.`,
			);
			// Delete the broken/empty file from the disk to keep the folder clean
			try {
				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			} catch (e) {}
		} else {
			// If it fails but they ACTUALLY spoke, print the raw FFmpeg logs so we can see why!
			console.warn(
				`FFmpeg closed with error code ${code} for file ${filePath}`,
			);
			console.warn(
				`\n--- FFMPEG FATAL LOGS ---\n${ffmpegLogs.trim()}\n-------------------------\n`,
			);
		}
	});
}
