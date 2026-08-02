import { db } from "@/db/index.js";
import { sessions, transcriptionQueue } from "@/db/schema.js";
import type {
	ActiveSessionRuntime,
	BotRuntimeState,
} from "@/recording/types.js";
import { logger } from "@/logger.js";
import { createListeningStream } from "@/utils/createListeningStream.js";
import { userToCharacterMap } from "@/utils/userToCharacterMap.js";
import { VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import {
	type ChatInputCommandInteraction,
	type Client,
	type Snowflake,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const MAX_TRANSCRIPTION_RETRIES = 3;
const SESSION_ROOT = path.join(process.cwd(), "sessions");
const voiceHooks = new Set<string>();
const DND_GLOSSARY =
	"D&D, RPG. Słowa: bludgeoning, piercing, slashing, stealth, rzut na percepcję, d20, obrażenia, damage, fireball, armor class, AC, check, saving throw, nat 20.";

let workerClient: Client | null = null;
let workerRunning = false;
let workerQueued = false;
let workerStarted = false;

export function getSessionPaths(sessionKey: string) {
	const root = path.join(SESSION_ROOT, sessionKey);

	return {
		root,
		audioDir: path.join(root, "audio"),
		transcriptsDir: path.join(root, "transcripts"),
		mergedTranscriptPath: path.join(root, "Raw_Transcript.txt"),
		summaryPath: path.join(root, "Summary.txt"),
		summaryPromptPath: path.join(root, "summary-prompt.txt"),
	};
}

function ensureDir(dirPath: string) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

function ensureSessionDirectories(sessionKey: string) {
	const paths = getSessionPaths(sessionKey);
	ensureDir(paths.root);
	ensureDir(paths.audioDir);
	ensureDir(paths.transcriptsDir);
	return paths;
}

function createSessionKey(guildId: string, now = new Date()) {
	const datePart = now
		.toISOString()
		.replace("T", "_")
		.slice(0, 19)
		.replace(/:/g, "-");
	return `${datePart}_${guildId}`;
}

function padSequence(sequence: number) {
	return sequence.toString().padStart(6, "0");
}

function parseRecordingFileName(fileName: string) {
	const match = /^(\d+)-(\d+)-(\d+)\.wav$/.exec(fileName);
	if (!match) {
		return null;
	}

	return {
		sequence: Number(match[1]),
		startedAtMs: Number(match[2]),
		userId: match[3]!,
	};
}

async function getQueueCounts(sessionId: number) {
	const rows = await db
		.select({
			status: transcriptionQueue.status,
			count: sql<number>`count(*)`,
		})
		.from(transcriptionQueue)
		.where(eq(transcriptionQueue.sessionId, sessionId))
		.groupBy(transcriptionQueue.status);

	const counts = {
		pending: 0,
		processing: 0,
		completed: 0,
		failed: 0,
	};

	for (const row of rows) {
		if (row.status in counts) {
			counts[row.status as keyof typeof counts] = row.count;
		}
	}

	return counts;
}

async function computeClosedSessionStatus(sessionId: number) {
	const [session] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.id, sessionId))
		.limit(1);

	if (!session) {
		throw new Error(`Session ${sessionId} not found.`);
	}

	const counts = await getQueueCounts(sessionId);

	if (counts.pending + counts.processing > 0) {
		return "queued" as const;
	}

	if (counts.failed > 0) {
		return "failed" as const;
	}

	if (session.fullCorrectedTimeline) {
		return "completed" as const;
	}

	return "transcribed" as const;
}

async function syncSessionStatus(sessionId: number) {
	const [session] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.id, sessionId))
		.limit(1);

	if (!session) {
		return;
	}

	if (
		!session.endedAt ||
		session.status === "recording" ||
		session.status === "summarizing"
	) {
		return;
	}

	const nextStatus = await computeClosedSessionStatus(sessionId);
	if (nextStatus !== session.status) {
		await db
			.update(sessions)
			.set({ status: nextStatus })
			.where(eq(sessions.id, sessionId));
		logger.info(
			{
				sessionId,
				previousStatus: session.status,
				nextStatus,
			},
			"Session status updated.",
		);
	}
}

export async function createRecordingSession(params: {
	guildId: Snowflake;
	voiceChannelId: Snowflake;
	transcriptionChannelId: Snowflake | null;
	liveTranscription: boolean;
	postTranscripts: boolean;
	campaignId?: number | null;
}) {
	const sessionKey = createSessionKey(params.guildId);
	ensureSessionDirectories(sessionKey);

	const [session] = await db
		.insert(sessions)
		.values({
			sessionKey,
			campaignId: params.campaignId ?? null,
			guildId: params.guildId,
			voiceChannelId: params.voiceChannelId,
			transcriptionChannelId: params.transcriptionChannelId,
			liveTranscription: params.liveTranscription,
			postTranscripts: params.postTranscripts,
			status: "recording",
		})
		.returning();

	if (!session) {
		throw new Error("Failed to create a recording session.");
	}

	logger.info(
		{
			sessionId: session.id,
			sessionKey: session.sessionKey,
			guildId: session.guildId,
			voiceChannelId: session.voiceChannelId,
			liveTranscription: session.liveTranscription,
			postTranscripts: session.postTranscripts,
			transcriptionChannelId: session.transcriptionChannelId,
		},
		"Created recording session.",
	);

	return {
		id: session.id,
		sessionKey: session.sessionKey,
		guildId: session.guildId as Snowflake,
		voiceChannelId: session.voiceChannelId as Snowflake,
		transcriptionChannelId: (session.transcriptionChannelId ??
			null) as Snowflake | null,
		liveTranscription: session.liveTranscription,
		postTranscripts: session.postTranscripts,
		campaignId: session.campaignId ?? null,
		nextSequence: 1,
	} satisfies ActiveSessionRuntime;
}

export async function finalizeRecordingSession(
	guildId: Snowflake,
	runtime: BotRuntimeState,
	reason?: string,
) {
	const activeSession = runtime.activeSessions.get(guildId);
	if (!activeSession) {
		logger.debug(
			{
				guildId,
				reason,
			},
			"No active recording session to finalize.",
		);
		return null;
	}

	runtime.activeSessions.delete(guildId);

	const finalStatus = await computeClosedSessionStatus(activeSession.id);
	await db
		.update(sessions)
		.set({
			endedAt: new Date(),
			status: finalStatus,
			lastError: reason ?? null,
		})
		.where(eq(sessions.id, activeSession.id));

	logger.info(
		{
			sessionId: activeSession.id,
			sessionKey: activeSession.sessionKey,
			guildId,
			finalStatus,
			reason,
		},
		"Finalized recording session.",
	);

	return activeSession;
}

async function markSessionAsTranscribing(sessionId: number) {
	const [session] = await db
		.select({
			status: sessions.status,
			endedAt: sessions.endedAt,
		})
		.from(sessions)
		.where(eq(sessions.id, sessionId))
		.limit(1);

	if (!session || !session.endedAt || session.status === "recording") {
		return;
	}

	if (session.status !== "summarizing") {
		await db
			.update(sessions)
			.set({ status: "transcribing" })
			.where(eq(sessions.id, sessionId));
		logger.info({ sessionId }, "Session moved to transcribing.");
	}
}

async function writeClipTranscriptArtifact(
	sessionKey: string,
	sequence: number,
	userId: string,
	audioFilePath: string,
	rawText: string,
) {
	const paths = ensureSessionDirectories(sessionKey);
	const transcriptPath = path.join(
		paths.transcriptsDir,
		`${padSequence(sequence)}-${userId}.json`,
	);
	const speaker = userToCharacterMap[userId] ?? userId;

	fs.writeFileSync(
		transcriptPath,
		JSON.stringify(
			{
				sequence,
				userId,
				speaker,
				audioFilePath,
				rawText,
				timestamp: new Date().toISOString(),
			},
			null,
			2,
		),
	);
	logger.debug(
		{
			sessionKey,
			sequence,
			userId,
			speaker,
			audioFilePath,
			transcriptPath,
			rawTextLength: rawText.length,
		},
		"Wrote transcript artifact.",
	);
}

async function buildWhisperPrompt(sessionId: number, userId: string) {
	const [previousClip] = await db
		.select({
			rawText: transcriptionQueue.rawText,
		})
		.from(transcriptionQueue)
		.where(
			and(
				eq(transcriptionQueue.sessionId, sessionId),
				eq(transcriptionQueue.userId, userId),
				eq(transcriptionQueue.status, "completed"),
			),
		)
		.orderBy(desc(transcriptionQueue.sequence))
		.limit(1);

	const previousContext = previousClip?.rawText?.trim();
	return previousContext
		? `${DND_GLOSSARY} Kontekst: ${previousContext}`
		: DND_GLOSSARY;
}

async function transcribeAudioClip(job: {
	audioFilePath: string;
	sessionId: number;
	userId: string;
}) {
	const whisperUrl =
		process.env.WHISPER_SERVER_URL ?? "http://127.0.0.1:8080/inference";
	const prompt = await buildWhisperPrompt(job.sessionId, job.userId);

	const form = new FormData();
	form.append(
		"file",
		Bun.file(job.audioFilePath),
		path.basename(job.audioFilePath),
	);
	form.append("model", "whisper-1");
	form.append("language", "pl");
	form.append("response_format", "json");
	form.append("prompt", prompt);

	const response = await fetch(whisperUrl, {
		method: "POST",
		body: form,
		signal: AbortSignal.timeout(10 * 60 * 1000),
	});
	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(
			`Whisper server responded with ${response.status} ${response.statusText}: ${errorBody || "no response body"}`,
		);
	}
	const responseData = (await response.json()) as { text?: unknown };

	const rawText = String(responseData?.text ?? "").trim();
	logger.debug(
		{
			sessionId: job.sessionId,
			userId: job.userId,
			audioFilePath: job.audioFilePath,
			rawTextLength: rawText.length,
		},
		"Whisper transcription finished.",
	);
	return rawText;
}

function splitLongMessage(message: string, limit = 1900) {
	if (message.length <= limit) {
		return [message];
	}

	const chunks: string[] = [];
	let cursor = 0;
	while (cursor < message.length) {
		let end = Math.min(cursor + limit, message.length);
		if (end < message.length) {
			const newline = message.lastIndexOf("\n", end);
			if (newline > cursor + 200) {
				end = newline;
			}
		}
		chunks.push(message.slice(cursor, end).trim());
		cursor = end;
	}
	return chunks.filter(Boolean);
}

async function postTranscriptIfNeeded(
	client: Client,
	session: typeof sessions.$inferSelect,
	job: typeof transcriptionQueue.$inferSelect,
	rawText: string,
) {
	if (!session.postTranscripts || !session.transcriptionChannelId || !rawText) {
		return;
	}

	const channel = await client.channels.fetch(session.transcriptionChannelId);
	if (!channel?.isTextBased()) {
		throw new Error(
			`Channel ${session.transcriptionChannelId} is unavailable for transcript posting.`,
		);
	}

	const speaker = userToCharacterMap[job.userId] ?? job.userId;
	const message = `**${speaker}**: ${rawText}`;
	const textChannel = channel as Exclude<typeof channel, null> & {
		send: (message: string) => Promise<unknown>;
	};
	for (const chunk of splitLongMessage(message)) {
		await textChannel.send(chunk);
	}

	await db
		.update(transcriptionQueue)
		.set({ postedAt: new Date() })
		.where(eq(transcriptionQueue.id, job.id));
}

async function recoverSessionsAndQueue() {
	ensureDir(SESSION_ROOT);

	await db
		.update(transcriptionQueue)
		.set({
			status: "pending",
			startedAt: null,
			lastError: "Recovered after restart.",
		})
		.where(eq(transcriptionQueue.status, "processing"));
	logger.info("Recovered in-flight transcription jobs.");

	const staleSessions = await db
		.select()
		.from(sessions)
		.where(eq(sessions.status, "recording"));

	for (const session of staleSessions) {
		logger.warn(
			{
				sessionId: session.id,
				sessionKey: session.sessionKey,
				guildId: session.guildId,
			},
			"Recovering stale recording session after restart.",
		);
		await db
			.update(sessions)
			.set({
				endedAt: session.endedAt ?? new Date(),
				status: "queued",
				lastError: session.lastError ?? "Recovered after restart.",
			})
			.where(eq(sessions.id, session.id));
	}

	const recoverableSessions = await db
		.select()
		.from(sessions)
		.where(
			inArray(sessions.status, [
				"queued",
				"transcribing",
				"transcribed",
				"failed",
				"completed",
			]),
		);

	for (const session of recoverableSessions) {
		if (!session.liveTranscription) {
			logger.debug(
				{
					sessionId: session.id,
					sessionKey: session.sessionKey,
					status: session.status,
				},
				"Skipping transcription queue recovery for session without live transcription.",
			);
			continue;
		}

		const paths = getSessionPaths(session.sessionKey);
		if (!fs.existsSync(paths.audioDir)) {
			continue;
		}

		const existingRows = await db
			.select({
				audioFilePath: transcriptionQueue.audioFilePath,
			})
			.from(transcriptionQueue)
			.where(eq(transcriptionQueue.sessionId, session.id));
		const knownFiles = new Set(existingRows.map((row) => row.audioFilePath));

		for (const fileName of fs
			.readdirSync(paths.audioDir)
			.filter((file) => file.endsWith(".wav"))) {
			const filePath = path.join(paths.audioDir, fileName);
			if (knownFiles.has(filePath)) {
				continue;
			}

			const parsed = parseRecordingFileName(fileName);
			if (!parsed) {
				logger.warn(
					{
						sessionId: session.id,
						sessionKey: session.sessionKey,
						fileName,
					},
					"Skipping unrecognized recording file during recovery.",
				);
				continue;
			}

			await db.insert(transcriptionQueue).values({
				sessionId: session.id,
				campaignId: session.campaignId,
				guildId: session.guildId,
				userId: parsed.userId,
				audioFilePath: filePath,
				sequence: parsed.sequence,
				status: "pending",
				lastError: "Recovered orphaned audio clip.",
			});
			logger.info(
				{
					sessionId: session.id,
					sessionKey: session.sessionKey,
					audioFilePath: filePath,
					sequence: parsed.sequence,
					userId: parsed.userId,
				},
				"Recovered orphaned audio clip into transcription queue.",
			);
		}

		await syncSessionStatus(session.id);
	}
}

async function claimNextJob() {
	const [job] = await db
		.select()
		.from(transcriptionQueue)
		.where(
			and(
				or(
					eq(transcriptionQueue.status, "pending"),
					eq(transcriptionQueue.status, "failed"),
				),
				lt(transcriptionQueue.attemptCount, MAX_TRANSCRIPTION_RETRIES),
			),
		)
		.orderBy(
			asc(transcriptionQueue.createdAt),
			asc(transcriptionQueue.sequence),
			asc(transcriptionQueue.id),
		)
		.limit(1);

	if (!job) {
		return null;
	}

	await db
		.update(transcriptionQueue)
		.set({
			status: "processing",
			attemptCount: job.attemptCount + 1,
			startedAt: new Date(),
			lastError: null,
		})
		.where(eq(transcriptionQueue.id, job.id));
	logger.debug(
		{
			jobId: job.id,
			sessionId: job.sessionId,
			sequence: job.sequence,
			userId: job.userId,
			attemptCount: job.attemptCount + 1,
		},
		"Claimed transcription job.",
	);

	return {
		...job,
		attemptCount: job.attemptCount + 1,
		status: "processing" as const,
	};
}

async function processQueueJob(
	job: typeof transcriptionQueue.$inferSelect,
	client: Client,
) {
	const [session] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.id, job.sessionId))
		.limit(1);

	if (!session) {
		logger.error(
			{
				jobId: job.id,
				sessionId: job.sessionId,
				audioFilePath: job.audioFilePath,
			},
			"Transcription job references a missing session.",
		);
		await db
			.update(transcriptionQueue)
			.set({
				status: "failed",
				lastError: `Session ${job.sessionId} no longer exists.`,
				finishedAt: new Date(),
			})
			.where(eq(transcriptionQueue.id, job.id));
		return;
	}

	try {
		logger.info(
			{
				jobId: job.id,
				sessionId: job.sessionId,
				sessionKey: session.sessionKey,
				sequence: job.sequence,
				userId: job.userId,
				attemptCount: job.attemptCount,
				audioFilePath: job.audioFilePath,
			},
			"Starting transcription job.",
		);
		await markSessionAsTranscribing(session.id);
		const rawText = await transcribeAudioClip(job);

		await writeClipTranscriptArtifact(
			session.sessionKey,
			job.sequence,
			job.userId,
			job.audioFilePath,
			rawText,
		);

		await db
			.update(transcriptionQueue)
			.set({
				rawText,
				status: "completed",
				finishedAt: new Date(),
			})
			.where(eq(transcriptionQueue.id, job.id));

		if (rawText) {
			await postTranscriptIfNeeded(client, session, job, rawText);
		}
		logger.info(
			{
				jobId: job.id,
				sessionId: job.sessionId,
				sessionKey: session.sessionKey,
				sequence: job.sequence,
				userId: job.userId,
				rawTextLength: rawText.length,
				posted: Boolean(rawText && session.postTranscripts),
			},
			"Completed transcription job.",
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown transcription error";
		const isFinalAttempt = job.attemptCount >= MAX_TRANSCRIPTION_RETRIES;
		logger[isFinalAttempt ? "error" : "warn"](
			{
				err: error,
				jobId: job.id,
				sessionId: job.sessionId,
				sequence: job.sequence,
				userId: job.userId,
				audioFilePath: job.audioFilePath,
				attemptCount: job.attemptCount,
				maxAttempts: MAX_TRANSCRIPTION_RETRIES,
			},
			isFinalAttempt
				? "Transcription job failed permanently."
				: "Transcription job failed; it will be retried.",
		);
		await db
			.update(transcriptionQueue)
			.set({
				status: "failed",
				lastError: message,
				finishedAt: new Date(),
			})
			.where(eq(transcriptionQueue.id, job.id));
	} finally {
		await syncSessionStatus(job.sessionId);
	}
}

async function runQueueWorker() {
	if (!workerClient || workerRunning) {
		workerQueued = true;
		logger.debug(
			{
				hasClient: Boolean(workerClient),
				workerRunning,
			},
			"Transcription worker trigger queued.",
		);
		return;
	}

	workerRunning = true;
	workerQueued = false;
	logger.debug("Transcription worker started.");

	try {
		while (true) {
			const job = await claimNextJob();
			if (!job) {
				break;
			}

			await processQueueJob(job, workerClient);
		}
	} finally {
		workerRunning = false;
		logger.debug("Transcription worker stopped.");
		if (workerQueued) {
			void runQueueWorker();
		}
	}
}

export function startTranscriptionWorker(client: Client) {
	workerClient = client;
	if (!workerStarted) {
		workerStarted = true;
		logger.info("Starting transcription worker.");
		void recoverSessionsAndQueue()
			.then(() => runQueueWorker())
			.catch((error) => {
				logger.error(
					{ err: error },
					"Failed to recover the transcription queue.",
				);
			});
		const interval = setInterval(() => {
			void runQueueWorker();
		}, 5000);
		interval.unref?.();
	}

	return () => {
		void runQueueWorker();
	};
}

export async function enqueueTranscriptionJob(params: {
	sessionId: number;
	campaignId: number | null;
	guildId: string;
	userId: string;
	audioFilePath: string;
	sequence: number;
}) {
	await db.insert(transcriptionQueue).values({
		sessionId: params.sessionId,
		campaignId: params.campaignId,
		guildId: params.guildId,
		userId: params.userId,
		audioFilePath: params.audioFilePath,
		sequence: params.sequence,
		status: "pending",
	});
	logger.info(
		{
			sessionId: params.sessionId,
			guildId: params.guildId,
			userId: params.userId,
			audioFilePath: params.audioFilePath,
			sequence: params.sequence,
		},
		"Queued audio clip for transcription.",
	);
}

async function startUserRecording(
	connection: VoiceConnection,
	client: Client,
	guildId: Snowflake,
	userId: string,
	runtime: BotRuntimeState,
) {
	const session = runtime.activeSessions.get(guildId);
	if (!session) {
		logger.debug(
			{
				guildId,
				userId,
			},
			"Ignoring speaker because there is no active recording session.",
		);
		return;
	}

	if (!Object.hasOwn(userToCharacterMap, userId)) {
		logger.debug(
			{
				sessionId: session.id,
				sessionKey: session.sessionKey,
				userId,
			},
			"Ignoring unmapped speaker.",
		);
		return;
	}

	const user = await client.users.fetch(userId);
	const sequence = session.nextSequence++;
	await createListeningStream(connection.receiver, user, {
		sessionId: session.id,
		sessionKey: session.sessionKey,
		sequence,
		guildId: session.guildId,
		campaignId: session.campaignId,
		onRecordingSaved: async (savedClip) => {
			if (!session.liveTranscription) {
				logger.debug(
					{
						sessionId: session.id,
						sessionKey: session.sessionKey,
						sequence,
						userId: user.id,
						audioFilePath: savedClip.audioFilePath,
					},
					"Skipping transcription queue because live transcription is disabled.",
				);
				return;
			}

			await enqueueTranscriptionJob({
				sessionId: session.id,
				campaignId: session.campaignId,
				guildId: session.guildId,
				userId: user.id,
				audioFilePath: savedClip.audioFilePath,
				sequence,
			});
			runtime.triggerTranscriptionWorker();
		},
	});
}

export function attachVoiceSessionHooks(
	connection: VoiceConnection,
	client: Client,
	guildId: Snowflake,
	runtime: BotRuntimeState,
) {
	if (voiceHooks.has(guildId)) {
		logger.debug({ guildId }, "Voice session hooks already attached.");
		return;
	}

	voiceHooks.add(guildId);
	logger.info({ guildId }, "Attached voice session hooks.");

	connection.receiver.speaking.on("start", async (userId) => {
		try {
			await startUserRecording(connection, client, guildId, userId, runtime);
		} catch (error) {
			logger.error(
				{
					err: error,
					guildId,
					userId,
				},
				"Failed to start recording for speaker.",
			);
		}
	});

	connection.on(VoiceConnectionStatus.Disconnected, async () => {
		voiceHooks.delete(guildId);
		logger.warn(
			{
				guildId,
				connectionReason:
					"reason" in connection.state ? connection.state.reason : undefined,
			},
			"Voice connection disconnected; finalizing active recording session.",
		);
		try {
			await finalizeRecordingSession(
				guildId,
				runtime,
				"Voice connection disconnected.",
			);
			runtime.triggerTranscriptionWorker();
		} catch (error) {
			logger.error(
				{
					err: error,
					guildId,
				},
				"Failed to finalize session after voice disconnect.",
			);
		}
	});
}

export async function startRecordingForCurrentSpeakers(
	connection: VoiceConnection,
	client: Client,
	guildId: Snowflake,
	runtime: BotRuntimeState,
) {
	for (const userId of connection.receiver.speaking.users.keys()) {
		await startUserRecording(connection, client, guildId, userId, runtime);
	}
}

function buildSummaryPrompt(transcript: string) {
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

async function resolveSummaryTarget(guildId: Snowflake, sessionId?: number) {
	const rows = sessionId
		? await db
				.select()
				.from(sessions)
				.where(and(eq(sessions.guildId, guildId), eq(sessions.id, sessionId)))
				.limit(1)
		: await db
				.select()
				.from(sessions)
				.where(eq(sessions.guildId, guildId))
				.orderBy(desc(sessions.startedAt), desc(sessions.id))
				.limit(1);

	return rows[0] ?? null;
}

export async function summarizeSession(
	interaction: ChatInputCommandInteraction<"cached">,
	sessionId?: number,
	force = false,
) {
	const session = await resolveSummaryTarget(interaction.guildId, sessionId);
	if (!session) {
		throw new Error("No session found for this server.");
	}

	if (session.status === "recording") {
		throw new Error("The current session is still recording.");
	}

	const counts = await getQueueCounts(session.id);
	if (counts.pending + counts.processing > 0) {
		throw new Error(
			"This session is still being transcribed. Try again later.",
		);
	}
	if (counts.failed > 0 && !force) {
		throw new Error(
			"This session has failed transcription jobs. Resolve them or re-run with force:true.",
		);
	}
	if (session.fullCorrectedTimeline && !force) {
		throw new Error(
			"This session already has a summary. Re-run with force:true to overwrite it.",
		);
	}

	const clips = await db
		.select({
			id: transcriptionQueue.id,
			userId: transcriptionQueue.userId,
			rawText: transcriptionQueue.rawText,
			sequence: transcriptionQueue.sequence,
		})
		.from(transcriptionQueue)
		.where(eq(transcriptionQueue.sessionId, session.id))
		.orderBy(asc(transcriptionQueue.sequence));

	const transcript = clips
		.filter((clip) => clip.rawText?.trim())
		.map(
			(clip) =>
				`${userToCharacterMap[clip.userId] ?? clip.userId}: ${clip.rawText!.trim()}`,
		)
		.join("\n");

	if (!transcript) {
		throw new Error("This session has no completed transcript text yet.");
	}

	const paths = ensureSessionDirectories(session.sessionKey);
	fs.writeFileSync(paths.mergedTranscriptPath, transcript);

	const prompt = buildSummaryPrompt(transcript);
	fs.writeFileSync(paths.summaryPromptPath, prompt);

	await db
		.update(sessions)
		.set({
			status: "summarizing",
			fullRawTimeline: transcript,
			lastError: null,
		})
		.where(eq(sessions.id, session.id));

	try {
		const summary = await runLlamaSummary(paths.summaryPromptPath);
		fs.writeFileSync(paths.summaryPath, summary);

		await db
			.update(sessions)
			.set({
				status: "completed",
				fullRawTimeline: transcript,
				fullCorrectedTimeline: summary,
			})
			.where(eq(sessions.id, session.id));

		const targetChannel = interaction.channel;
		if (!targetChannel?.isTextBased()) {
			return summary;
		}

		await interaction.editReply(
			`Summary for session \`${session.sessionKey}\` is ready${force ? " (force mode)" : ""}. Posting it below.`,
		);
		for (const chunk of splitLongMessage(summary)) {
			await targetChannel.send(chunk);
		}

		return summary;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown summary failure";
		await db
			.update(sessions)
			.set({
				status: "failed",
				lastError: message,
			})
			.where(eq(sessions.id, session.id));
		throw error;
	}
}
