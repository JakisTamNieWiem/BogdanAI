import { db } from "@/db/index.js";
import { spells } from "@/db/schema.js";
import {
	ApplicationIntegrationType,
	BaseInteraction,
	EmbedBuilder,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";
import { asc, like } from "drizzle-orm";

export default {
	data: new SlashCommandBuilder()
		.setName("searchspell")
		.setDescription("searches for a spell")
		.addStringOption((option) =>
			option
				.setName("name")
				.setDescription("spell name")
				.setAutocomplete(true)
				.setRequired(true),
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
			// const spell = spells.find((_spell) => _spell.name.toLowerCase() === interaction.options.getString('name')?.toLowerCase());
			const spellName = interaction.options.getString("name");
			if (!spellName) {
				await interaction.reply({
					content: "Please provide a spell name.",
					flags: "Ephemeral",
				});
				return;
			}
			const spellResult = await db
				.select()
				.from(spells)
				.where(like(spells.name, spellName))
				.limit(1);

			const spell = spellResult[0]; // The result of .select() is always an array

			if (!spell) {
				await interaction.reply({
					content: "Spell not found",
					flags: "Ephemeral",
				});
				return;
			}
			// prettier-ignore
			const embed1 = new EmbedBuilder()
				.setColor(0x00ff00)
				.setTitle(spell.name)
				.setDescription(
					`*${spell.type}*⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`,
				)
				.addFields(
					{ name: "Casting Time: ", value: spell.casting_time },
					{ name: "Range: ", value: spell.range },
					{ name: "Components: ", value: spell.components },
					{ name: "Duration: ", value: spell.duration },
				);

			const embed2 = new EmbedBuilder()
				.setDescription(spell.description)
				.setColor(0x00ff00)
				.setTitle("Description: ");
			if (spell.higher_levels) {
				embed2.addFields({
					name: "At Higher Levels: ",
					value: spell.higher_levels,
				});
			}
			embed2.addFields({
				name: "Spell Lists: ",
				value: spell.classes
					.toString()
					.replace(/,/gi, ", ")
					.replace(/\b\w/g, (l) => l.toUpperCase()),
				inline: true,
			});
			await interaction.reply({ embeds: [embed1, embed2] });
		} else if (interaction.isAutocomplete()) {
			const focusedValue = interaction.options.getFocused();

			const choices = await db
				.select({
					name: spells.name,
				})
				.from(spells)
				.where(like(spells.name, `${focusedValue}%`))
				.orderBy(asc(spells.name))
				.limit(10);

			await interaction.respond(
				choices.map((choice) => ({ name: choice.name, value: choice.name })),
			);
		}
	},
};
