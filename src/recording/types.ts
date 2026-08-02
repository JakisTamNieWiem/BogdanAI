import type { Snowflake } from "discord.js";

export interface ActiveSessionRuntime {
	id: number;
	sessionKey: string;
	guildId: Snowflake;
	voiceChannelId: Snowflake;
	transcriptionChannelId: Snowflake | null;
	liveTranscription: boolean;
	postTranscripts: boolean;
	campaignId: number | null;
	nextSequence: number;
}

export interface BotRuntimeState {
	activeSessions: Map<Snowflake, ActiveSessionRuntime>;
	triggerTranscriptionWorker: () => void;
}
