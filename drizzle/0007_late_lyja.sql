DROP INDEX `campaignId_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `NPC_campaignId_name_unique` ON `NPC` (`campaignId`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Quest_campaignId_name_unique` ON `Quest` (`campaignId`,`name`);