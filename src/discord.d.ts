import type { BotRuntimeState } from "@/recording/types.js";
import { Collection, SlashCommandBuilder } from "discord.js";

declare module "discord.js" {
	export interface Client {
		commands: Collection<string, Command>;
	}

	export interface Command {
		data: SlashCommandBuilder;
		execute: (
			interaction: BaseInteraction,
			runtime?: BotRuntimeState,
		) => Promise<void>;
	}
}
