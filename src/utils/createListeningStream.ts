import { EndBehaviorType, type VoiceReceiver } from "@discordjs/voice";
import { type ChildProcess, spawn } from "node:child_process";
import type { User } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@/logger.js";
import { userToCharacterMap } from "./userToCharacterMap";

// ---------------------------------------------------------
// 🚀 THE IMMORTAL OGG MULTIPLEXER 🚀
// Wrap raw Discord Opus packets into Ogg pages for FFmpeg.
// ---------------------------------------------------------

const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let r = i << 24;
	for (let j = 0; j < 8; j++) {
		r = (r & 0x80000000) !== 0 ? (r << 1) ^ 0x04c11db7 : r << 1;
	}
	crc32Table[i] = r >>> 0;
}

function calculateCrc32(buffer: Buffer): number {
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
		opusHead.writeUInt8(1, 8);
		opusHead.writeUInt8(2, 9);
		opusHead.writeUInt16LE(3840, 10);
		opusHead.writeUInt32LE(48000, 12);
		opusHead.writeUInt16LE(0, 16);
		opusHead.writeUInt8(0, 18);

		const opusTags = Buffer.from(
			"OpusTags\x08\x00\x00\x00Overseer\x00\x00\x00\x00",
			"binary",
		);

		return Buffer.concat([
			this.createPage(opusHead, 0x02, 0),
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
		this.granule += 960;
		return this.createPage(packet, 0x00, this.granule);
	}

	public writeEndStream(): Buffer {
		return this.createPage(Buffer.alloc(0), 0x04, this.granule);
	}
}

export const activeRecordings = new Set<string>();

type ActiveProcess = {
	child: ChildProcess;
	closeGracefully: () => void;
	forceKill: () => void;
	forceKillTimer?: NodeJS.Timeout;
};

const activeFfmpegProcesses = new Map<string, ActiveProcess>();
let shutdownHooksRegistered = false;

function isWindows() {
	return process.platform === "win32";
}

function forceKillProcess(processRef: ChildProcess) {
	try {
		processRef.kill(isWindows() ? undefined : "SIGKILL");
	} catch {}
}

export const killAllFfmpeg = () => {
	logger.warn(
		{
			activeFfmpegProcesses: activeFfmpegProcesses.size,
		},
		"Closing active FFmpeg processes.",
	);
	for (const processRef of activeFfmpegProcesses.values()) {
		processRef.closeGracefully();
	}

	setTimeout(() => {
		for (const processRef of activeFfmpegProcesses.values()) {
			processRef.forceKill();
		}
	}, 4000).unref?.();
};

function registerShutdownHooks() {
	if (shutdownHooksRegistered) {
		return;
	}
	shutdownHooksRegistered = true;

	process.on("exit", killAllFfmpeg);
	process.on("SIGINT", () => {
		logger.warn("Received SIGINT.");
		killAllFfmpeg();
		process.exit(0);
	});
	process.on("SIGTERM", () => {
		logger.warn("Received SIGTERM.");
		killAllFfmpeg();
		process.exit(0);
	});
	process.on("uncaughtException", (error) => {
		logger.error(
			{ err: error },
			"Uncaught exception, closing FFmpeg processes.",
		);
		killAllFfmpeg();
		process.exit(1);
	});
}

function ensureDir(dirPath: string) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

type CreateListeningStreamOptions = {
	sessionId: number;
	sessionKey: string;
	sequence: number;
	guildId: string;
	campaignId: number | null;
	onRecordingSaved: (clip: {
		audioFilePath: string;
		sequence: number;
		sessionId: number;
		userId: string;
	}) => Promise<void>;
};

export async function createListeningStream(
	receiver: VoiceReceiver,
	user: User,
	options: CreateListeningStreamOptions,
) {
	registerShutdownHooks();

	const recordingKey = `${options.sessionId}:${user.id}`;
	if (activeRecordings.has(recordingKey)) {
		logger.debug(
			{
				sessionId: options.sessionId,
				sessionKey: options.sessionKey,
				userId: user.id,
				username: user.username,
			},
			"Recording stream already active for speaker.",
		);
		return false;
	}

	activeRecordings.add(recordingKey);

	const opusStream = receiver.subscribe(user.id, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: 2000,
		},
	});

	const sessionRoot = path.join(process.cwd(), "sessions", options.sessionKey);
	const audioDir = path.join(sessionRoot, "audio");
	ensureDir(audioDir);

	const startedAtMs = Date.now();
	const fileName = `${options.sequence}-${startedAtMs}-${user.id}.wav`;
	const filePath = path.join(audioDir, fileName);
	const speaker = userToCharacterMap[user.id] ?? user.username;

	logger.info(
		{
			sessionId: options.sessionId,
			sessionKey: options.sessionKey,
			sequence: options.sequence,
			userId: user.id,
			speaker,
			audioFilePath: filePath,
		},
		"Started recording speaker clip.",
	);

	const ffmpeg = spawn("ffmpeg", [
		"-f",
		"ogg",
		"-i",
		"pipe:0",
		"-af",
		"afftdn=nf=-25,dynaudnorm",
		"-ar",
		"16000",
		"-ac",
		"1",
		"-c:a",
		"pcm_s16le",
		"-f",
		"wav",
		"-y",
		filePath,
	]);

	let ffmpegLogs = "";
	let validPacketsWritten = 0;
	let isDestroyed = false;
	let closeRequested = false;
	const muxer = new OggOpusMultiplexer();

	const processRef: ActiveProcess = {
		child: ffmpeg,
		closeGracefully: () => {
			if (closeRequested) {
				return;
			}
			closeRequested = true;
			try {
				ffmpeg.stdin.write(muxer.writeEndStream());
			} catch {}
			try {
				ffmpeg.stdin.end();
			} catch {}

			processRef.forceKillTimer = setTimeout(() => {
				processRef.forceKill();
			}, 4000);
			processRef.forceKillTimer.unref?.();
		},
		forceKill: () => {
			clearTimeout(processRef.forceKillTimer);
			forceKillProcess(ffmpeg);
		},
	};
	activeFfmpegProcesses.set(recordingKey, processRef);

	ffmpeg.stderr.on("data", (chunk: Buffer) => {
		ffmpegLogs += chunk.toString();
		if (ffmpegLogs.length > 3000) {
			ffmpegLogs = ffmpegLogs.slice(-3000);
		}
	});

	try {
		ffmpeg.stdin.write(muxer.createHeaders());
	} catch (error) {
		logger.error(
			{ err: error, userId: user.id, speaker, audioFilePath: filePath },
			"Failed to write Ogg headers.",
		);
	}

	opusStream.on("data", (chunk: Buffer) => {
		if (isDestroyed || chunk.length < 10) {
			return;
		}

		try {
			ffmpeg.stdin.write(muxer.writePacket(chunk));
			validPacketsWritten++;
		} catch (error) {
			logger.error(
				{ err: error, userId: user.id, speaker, audioFilePath: filePath },
				"Failed to write audio packet to FFmpeg.",
			);
		}
	});

	const cleanup = () => {
		if (isDestroyed) {
			return;
		}
		isDestroyed = true;
		activeRecordings.delete(recordingKey);
		processRef.closeGracefully();
	};

	opusStream.on("end", cleanup);
	opusStream.on("close", cleanup);
	opusStream.on("error", (error) => {
		logger.error(
			{ err: error, userId: user.id, speaker, audioFilePath: filePath },
			"Opus stream failed.",
		);
		cleanup();
	});

	ffmpeg.on("close", async (code) => {
		clearTimeout(processRef.forceKillTimer);
		activeFfmpegProcesses.delete(recordingKey);
		activeRecordings.delete(recordingKey);

		if (code === 0) {
			if (validPacketsWritten === 0) {
				logger.debug(
					{
						sessionId: options.sessionId,
						sequence: options.sequence,
						userId: user.id,
						speaker,
						audioFilePath: filePath,
					},
					"Dropping empty recording clip.",
				);
				try {
					if (fs.existsSync(filePath)) {
						fs.unlinkSync(filePath);
					}
				} catch {}
				return;
			}

			await options.onRecordingSaved({
				audioFilePath: filePath,
				sequence: options.sequence,
				sessionId: options.sessionId,
				userId: user.id,
			});
			logger.info(
				{
					sessionId: options.sessionId,
					sessionKey: options.sessionKey,
					sequence: options.sequence,
					userId: user.id,
					speaker,
					audioFilePath: filePath,
					validPacketsWritten,
				},
				"Saved speaker clip.",
			);
			return;
		}

		if (validPacketsWritten === 0) {
			logger.debug(
				{
					code,
					sessionId: options.sessionId,
					sequence: options.sequence,
					userId: user.id,
					speaker,
					audioFilePath: filePath,
				},
				"Dropping empty recording clip after FFmpeg exit.",
			);
			try {
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			} catch {}
			return;
		}

		logger.warn(
			{
				code,
				sessionId: options.sessionId,
				sessionKey: options.sessionKey,
				sequence: options.sequence,
				userId: user.id,
				speaker,
				filePath,
				ffmpegLogs: ffmpegLogs.trim(),
			},
			"FFmpeg exited with a non-zero code. Keeping the audio file for manual recovery.",
		);
	});

	return true;
}
