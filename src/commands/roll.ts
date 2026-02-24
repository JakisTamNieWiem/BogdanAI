import { randomInt } from "crypto";
import {
	ApplicationIntegrationType,
	BaseInteraction,
	GuildMember,
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
		if (!interaction.isChatInputCommand()) return;

		try {
			const diceString = interaction.options.getString("message", true);
			const rollSets = diceString.trim().split(";");
			let formattedResults = "";

			// Process each group separated by ';'
			rollSets.forEach((setStr, index) => {
				if (!setStr.trim()) return;

				const results = processRollSet(setStr);
				results.forEach((res) => {
					formattedResults += `**Set ${index + 1}**: Roll: ${res.rollString} = **${res.total}**\n`;
				});
			});

			if (!formattedResults) {
				throw new Error("No valid dice expressions provided.");
			}

			// Format User Display Name safely
			const member = interaction.member as GuildMember;
			const userName =
				member?.nickname ??
				interaction.user.globalName ??
				interaction.user.username;

			const formattedMessage = `:game_die: **${userName}** Request: \`${diceString}\`\n${formattedResults}`;
			await interaction.reply(formattedMessage);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "An unknown error occurred.";
			await interaction.reply({
				content: `Error: ${errorMessage}`,
				ephemeral: true,
			});
		}
	},
};

function processRollSet(
	expression: string,
): { rollString: string; total: number }[] {
	// Matches '1d20', 'd6', '+', '-', '*', '/', or '5'
	const tokens = expression.match(/(\d*d\d+)|([+\-*/])|(\d+)/g);
	if (!tokens || tokens.length === 0) {
		throw new Error(`Invalid dice expression: ${expression}`);
	}

	let quantity = 1;

	// FIX: If the first token is a pure number and there are subsequent tokens,
	// treat it as the quantifier (e.g., "2 +d20+2" -> quantity: 2, remaining: "+d20+2")
	if (/^\d+$/.test(tokens[0]!) && tokens.length > 1) {
		quantity = parseInt(tokens.shift()!, 10);
	}

	const results = [];
	for (let q = 0; q < quantity; q++) {
		// Pass a copy of the remaining tokens to evaluate independently
		results.push(evaluateTokens([...tokens]));
	}

	return results;
}

function evaluateTokens(tokens: string[]): {
	rollString: string;
	total: number;
} {
	let total = 0;
	let rollString = "";
	let currentOp = "+";
	let expected: "VALUE" | "OPERATOR" = "VALUE";

	// FIX: Extract Advantage/Disadvantage Modifier
	// Only if it starts with +/- AND is directly followed by a dice token
	let advDisadv: "ADV" | "DISADV" | null = null;
	if ((tokens[0] === "+" || tokens[0] === "-") && tokens[1]?.includes("d")) {
		advDisadv = tokens.shift() === "+" ? "ADV" : "DISADV";
	}

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;

		if (expected === "VALUE") {
			let valueTotal = 0;
			let valueString = "";

			if (token.includes("d")) {
				// Handle Advantage/Disadvantage on the FIRST dice
				if (advDisadv && i === 0) {
					const sides = parseInt(token.split("d")[1] || "20", 10);
					const rolls = [roll(sides), roll(sides)];

					// Sort: Descending for Advantage, Ascending for Disadvantage
					rolls.sort((a, b) => (advDisadv === "ADV" ? b - a : a - b));

					const kept = rolls[0]!;
					const dropped = rolls[1]!;
					valueTotal = kept;
					valueString = `[**${kept}**, ~~${dropped}~~]`;
				} else {
					const rolls = rollDiceString(token);
					valueTotal = rolls.reduce((a, b) => a + b, 0);
					valueString = `\`[${rolls.join(", ")}]\``;
				}
			} else if (/^\d+$/.test(token)) {
				valueTotal = parseInt(token, 10);
				valueString = `\`[${valueTotal}]\``;
			} else {
				throw new Error(
					`Unexpected token: ${token}. Expected a number or dice.`,
				);
			}

			// Apply Math operation to running total
			if (currentOp === "+") total += valueTotal;
			else if (currentOp === "-") total -= valueTotal;
			else if (currentOp === "*") total *= valueTotal;
			else if (currentOp === "/") total /= valueTotal;

			// Append to format string
			if (rollString.length > 0) rollString += ` \`${currentOp}\` `;
			rollString += valueString;

			expected = "OPERATOR";
		} else if (/^[+\-*/]$/.test(token)) {
			currentOp = token;
			expected = "VALUE";
		} else {
			throw new Error(
				`Unexpected token: ${token}. Expected an operator (+, -, *, /).`,
			);
		}
	}

	if (expected === "VALUE")
		throw new Error("Expression ends abruptly with an operator.");

	// Optional: TTRPGs usually round division down
	if (!Number.isInteger(total)) total = Math.floor(total);

	return { rollString, total };
}

function roll(sides: number): number {
	return Math.floor(Math.random() * sides) + 1;
}

// Helper for multiple dice (e.g., "2d6")
function rollDiceString(diceStr: string): number[] {
	const [countStr, sidesStr] = diceStr.split("d");
	const count = countStr ? parseInt(countStr, 10) : 1;
	const sides = parseInt(sidesStr!, 10);
	return Array.from({ length: count }, () => roll(sides));
}

function rollDice(diceExp: string): number[] {
	const parts = diceExp.split("d");
	const [amount, faces] =
		parts[0] === "" ? [1, parts[1]] : [parts[0], parts[1]];
	const results = [];
	for (let i = 0; i < parseInt(amount as string, 10); i++) {
		results.push(randomInt(1, parseInt(faces as string, 10) + 1));
	}

	return results;
}
