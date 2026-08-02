import { logger } from "@/logger.js";
import {
	ApplicationIntegrationType,
	BaseInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("petarda")
		.setDescription("Ile masz w petardzie?")
		.setContexts([
			InteractionContextType.PrivateChannel,
			InteractionContextType.BotDM,
			InteractionContextType.Guild,
		])
		.setIntegrationTypes([
			ApplicationIntegrationType.UserInstall,
			ApplicationIntegrationType.GuildInstall,
		]),
	async execute(interaction: BaseInteraction) {
		if (interaction.isChatInputCommand()) {
			logger.info(`Command ${interaction.commandName} executed`);
			interaction.reply({
				content: `${interaction.user} ma petarde o długości ${Math.floor(Math.random() * 30)} cm <a:kok:1401163498620325888>`,
			});
		}
	},
};
