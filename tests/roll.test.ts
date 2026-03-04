import { describe, expect, mock, test } from "bun:test";
import { BaseInteraction } from "discord.js";
// Assuming the provided code is saved in roll.ts in the same directory.
import rollCommand from "../src/commands/roll";

/**
 * Utility to mock a ChatInputCommandInteraction for the roll command.
 */
function createMockInteraction(diceString: string, isChatInput = true) {
	// Adding `payload: any` informs TypeScript that this mock expects arguments
	const replyMock = mock(async (payload: any) => {});

	const interaction = {
		isChatInputCommand: () => isChatInput,
		options: {
			getString: (name: string, required: boolean) => {
				if (name === "message") return diceString;
				return null;
			},
		},
		member: {
			nickname: "TestPlayer",
		},
		user: {
			globalName: "GlobalUser",
			username: "User123",
		},
		reply: replyMock,
	};

	return {
		interaction: interaction as unknown as BaseInteraction,
		replyMock,
	};
}

describe("Roll Slash Command", () => {
	test("Returns early if interaction is not a chat input command", async () => {
		const { interaction, replyMock } = createMockInteraction("1d20", false);
		await rollCommand.execute(interaction);

		expect(replyMock).not.toHaveBeenCalled();
	});

	test("Successfully rolls a single die (e.g., 1d20)", async () => {
		const { interaction, replyMock } = createMockInteraction("1d20");
		await rollCommand.execute(interaction);

		expect(replyMock).toHaveBeenCalledTimes(1);

		// Typecast the payload as a string
		const replyContent = replyMock.mock.calls[0]![0] as string;
		expect(typeof replyContent).toBe("string");

		expect(replyContent).toMatch(/:game_die: \*\*TestPlayer\*\* Request: `1d20`/);
		expect(replyContent).toMatch(/\*\*Set 1\*\*: Roll: `\[\d+\]` = \*\*\d+\*\*/);
	});

	test("Evaluates mathematical operators properly (e.g., 2d6 + 4)", async () => {
		const { interaction, replyMock } = createMockInteraction("2d6+4");
		await rollCommand.execute(interaction);

		const replyContent = replyMock.mock.calls[0]![0] as string;

		// Ensures the output format combines both the dice roll and the static addition
		expect(replyContent).toMatch(/`\[\d+, \d+\]` \+ `4`/);
	});

	test("Correctly applies Advantage modifier formatting (+d20)", async () => {
		const { interaction, replyMock } = createMockInteraction("+d20");
		await rollCommand.execute(interaction);

		const replyContent = replyMock.mock.calls[0]![0] as string;

		// Advantage keeps the higher roll; format is [**kept**, ~~dropped~~]
		expect(replyContent).toMatch(/`\[\d+, \d+\]` ~~\[\d+\]~~/);
	});

	test("Correctly applies Disadvantage modifier formatting (-d20)", async () => {
		const { interaction, replyMock } = createMockInteraction("-d20");
		await rollCommand.execute(interaction);

		const replyContent = replyMock.mock.calls[0]![0] as string;

		// Disadvantage keeps the lower roll; format is [**kept**, ~~dropped~~]
		expect(replyContent).toMatch(/`\[\d+, \d+\]` ~~\[\d+\]~~/);
	});

	test("Uses the initial number as a quantity multiplier (e.g., 3 1d20)", async () => {
		const { interaction, replyMock } = createMockInteraction("3 1d20");
		await rollCommand.execute(interaction);

		const replyContent = replyMock.mock.calls[0]![0] as string;

		// Since no semicolons are used, they are all part of 'Set 1'
		const matches = replyContent.match(/\*\*Set 1\*\*: Roll: `\[\d+\]`/g);
		expect(matches).not.toBeNull();
		expect(matches!.length).toBe(3); // Expect 3 separate rolls
	});

	test("Processes multiple sets separated by semicolons (e.g., 1d20; 2d6)", async () => {
		const { interaction, replyMock } = createMockInteraction("1d20 ; 2d6");
		await rollCommand.execute(interaction);

		const replyContent = replyMock.mock.calls[0]![0] as string;

		expect(replyContent).toMatch(/\*\*Set 1\*\*: Roll:/);
		expect(replyContent).toMatch(/\*\*Set 2\*\*: Roll:/);
	});

	test("Falls back to globalName or username if member nickname is unavailable", async () => {
		const { interaction, replyMock } = createMockInteraction("1d20");

		// Wipe nickname to simulate fallback
		(interaction as any).member = null;

		await rollCommand.execute(interaction);

		const replyContent = replyMock.mock.calls[0]![0] as string;
		expect(replyContent).toMatch(/:game_die: \*\*GlobalUser\*\* Request:/);
	});

	test("Rounds down non-integers on division operations", async () => {
		const { interaction, replyMock } = createMockInteraction("1d20 / 3");
		await rollCommand.execute(interaction);

		const replyContent = replyMock.mock.calls[0]![0] as string;

		// We check that the end result is formatted as a whole integer (e.g. **5**), 
		// proving that Math.floor() worked and didn't result in decimals (e.g. **5.333**)
		expect(replyContent).toMatch(/= \*\*\d+\*\*/);
	});

	describe("Error Handling", () => {
		test("Returns ephemeral error on totally invalid input", async () => {
			const { interaction, replyMock } = createMockInteraction("invalid_gibberish");
			await rollCommand.execute(interaction);

			// Typecast the error payload as an object
			const replyContent = replyMock.mock.calls[0]![0] as { flags: "Ephemeral"; content: string; };

			expect(typeof replyContent).toBe("object");
			expect(replyContent.flags).toBe("Ephemeral");
			expect(replyContent.content).toMatch(/Error: Invalid dice expression: invalid_gibberish/);
		});

		test("Returns ephemeral error when expression ends on an operator", async () => {
			const { interaction, replyMock } = createMockInteraction("1d20+");
			await rollCommand.execute(interaction);

			const replyContent = replyMock.mock.calls[0]![0] as {
                flags: "Ephemeral"; content: string;
};

			expect(typeof replyContent).toBe("object");
			expect(replyContent.flags).toBe("Ephemeral");
			expect(replyContent.content).toMatch(/Error: Expression ends abruptly with an operator./);
		});
	});
});