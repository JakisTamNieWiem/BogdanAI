import { Collection, SlashCommandBuilder } from "discord.js";

declare module "discord.js" {
	export interface Client {
		commands: Collection<string, Command>;
	}

	export interface Command {
		data: SlashCommandBuilder;
		execute: (interaction: BaseInteraction) => Promise<void>;
		subcommands?: Collection<
			string,
			(interaction: BaseInteraction) => Promise<void>
		>;
		autocomplete?: (interaction: BaseInteraction) => Promise<void>;
	}
}
