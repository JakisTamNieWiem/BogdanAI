CREATE TABLE `Campaign` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`dm` text NOT NULL,
	`players` text NOT NULL,
	`guildId` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `NPC` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT 'No description provided.' NOT NULL,
	`strengths` text,
	`weaknesses` text,
	`note` text,
	`portrait` text,
	`campaignId` integer NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `NPC_campaignId_name_unique` ON `NPC` (`campaignId`,`name`);--> statement-breakpoint
CREATE TABLE `PlayerCharacter` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`class` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`stats` text DEFAULT '[10,10,10,10,10,10]' NOT NULL,
	`proficiency` text NOT NULL,
	`expertise` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Quest` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`campaignId` integer NOT NULL,
	`NPCId` integer,
	`description` text NOT NULL,
	`shortDesc` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`location` text NOT NULL,
	`rewards` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`NPCId`) REFERENCES `NPC`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Quest_campaignId_name_unique` ON `Quest` (`campaignId`,`name`);--> statement-breakpoint
CREATE TABLE `Session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sessionKey` text NOT NULL,
	`campaignId` integer,
	`guildId` text NOT NULL,
	`voiceChannelId` text NOT NULL,
	`transcriptionChannelId` text,
	`liveTranscription` integer DEFAULT false NOT NULL,
	`postTranscripts` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'recording' NOT NULL,
	`startedAt` integer NOT NULL,
	`endedAt` integer,
	`lastError` text,
	`fullRawTimeline` text,
	`fullCorrectedTimeline` text,
	FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Session_sessionKey_unique` ON `Session` (`sessionKey`);--> statement-breakpoint
CREATE TABLE `Spell` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`casting_time` text NOT NULL,
	`range` text NOT NULL,
	`components` text NOT NULL,
	`duration` text NOT NULL,
	`description` text NOT NULL,
	`higher_levels` text,
	`source` text DEFAULT 'Player''s Handbook' NOT NULL,
	`classes` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Spell_name_unique` ON `Spell` (`name`);--> statement-breakpoint
CREATE TABLE `TranscriptionQueue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sessionId` integer NOT NULL,
	`campaignId` integer,
	`guildId` text NOT NULL,
	`userId` text NOT NULL,
	`audioFilePath` text NOT NULL,
	`sequence` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rawText` text,
	`correctedText` text,
	`attemptCount` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`createdAt` integer NOT NULL,
	`startedAt` integer,
	`finishedAt` integer,
	`postedAt` integer,
	FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `TranscriptionQueue_audioFilePath_unique` ON `TranscriptionQueue` (`audioFilePath`);
