CREATE TABLE `Campaign` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`dm` text NOT NULL,
	`players` text NOT NULL,
	`guildId` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `NPC` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`campaignId` integer NOT NULL,
	`portrait` text NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
	FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`NPCId`) REFERENCES `NPC`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaignId_name_unique` ON `Quest` (`campaignId`,`name`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `Spell_name_unique` ON `Spell` (`name`);