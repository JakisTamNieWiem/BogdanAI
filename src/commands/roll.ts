import { logger } from "@/logger";
import {
	ApplicationIntegrationType,
	BaseInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";

export default {
	data: new SlashCommandBuilder()
		.setName("roll")
		.setDescription("rolls dice")
		.addStringOption((option) =>
			option.setName("message").setDescription("dice").setRequired(true),
		)
		.setContexts(
			InteractionContextType.PrivateChannel,
			InteractionContextType.Guild,
			InteractionContextType.BotDM,
		)
		.setIntegrationTypes(
			ApplicationIntegrationType.UserInstall,
			ApplicationIntegrationType.GuildInstall,
		),

	async execute(interaction: BaseInteraction) {
		if (interaction.isChatInputCommand()) {
			const diceString = interaction.options.getString("message", true);
			try {
				const tokens = diceString.match(
					/\b(?:\d*d\d+)|(?:{\w+})|[+-]|(?:\b\d+\b)/gi,
				);
				logger.info("Tokens:\n" + tokens?.join("\n"));
				if (!tokens) {
					throw new Error("No valid dice tokens found.");
				}
				const results: string[][] = [];
				logger.info(parseInt(tokens[0] || "1", 10));
				for (
					let i = 0;
					i <
					(Number.isNaN(parseInt(tokens[0] || "1", 10))
						? 1
						: parseInt(tokens[0] || "1", 10));
					i++
				) {
					const rollResults = tokens.slice(1).map((token) => {
						if (/^\d+$/.test(token)) {
							return token; // Return numbers as is
						} else if (/^\d*d\d+$/.test(token)) {
							const rolls = rollDice(token);
							return rolls.join(", ");
						} else if (/^[-+]$/.test(token)) {
							return token; // Return operators as is
						} else {
							throw new Error(`Invalid token: ${token}`);
						}
					});
					results.push(rollResults);
				}

				logger.info("Rolls:\n" + results.map((r) => r.join(" ")).join("\n"));
				// Here you would typically format the results and send them back
				const formattedResults = results.map(
					(rolls, i) =>
						`${results.length > 1 ? `\n**Set ${i + 1}:** ` : ""}Roll: ${rolls
							.map((roll) => {
								if (roll !== "-" && roll !== "+") {
									return `\`[${roll}]\``;
								}
								return roll;
							})
							.join(" ")}`,
				);

				logger.info("Formatted Results:\n" + formattedResults);
				await interaction.reply(
					`:game_die: **${interaction.user.username}** Request: \`${diceString}\` ${formattedResults.join("")}`,
				); // Replace with actual roll results
			} catch (error) {
				await interaction.reply(`Invalid dice syntax: ${error.message}`);
			}
		}
	},
};

function rollDice(dice: string): number[] {
	if (/^d(\d+)$/.test(dice)) {
		dice = "1".concat(dice);
	}
	const match = dice.match(/^(\d+)d(\d+)$/);
	logger.info("Rolling dice: " + dice);
	if (!match || !match[2]) {
		throw new Error("Invalid dice format. Use NdM format (e.g., 2d6).");
	}
	const numDice = parseInt(match[1] || "1", 10);
	const sides = parseInt(match[2], 10);
	return Array.from(
		{ length: numDice },
		() => Math.floor(Math.random() * sides) + 1,
	);
}
