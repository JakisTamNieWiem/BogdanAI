import { EmbedBuilder, SlashCommandBuilder, BaseInteraction } from 'discord.js';
import { PrismaClient } from '@prisma/client';

export default {
	data: new SlashCommandBuilder()
		.setName('searchspell')
		.setDescription('searches for a spell')
		.addStringOption((option) => option.setName('name').setDescription('spell name').setAutocomplete(true).setRequired(true)),

	async execute(interaction: BaseInteraction, db: PrismaClient) {
		if (interaction.isChatInputCommand()) {
			// const spell = spells.find((_spell) => _spell.name.toLowerCase() === interaction.options.getString('name')?.toLowerCase());
			const spell = await db.spell.findFirst({
				where: {
					name: {
						endsWith: interaction.options.getString('name')?.toLocaleLowerCase(),
						mode: 'insensitive',
					},
				},
			});
			if (!spell) {
				interaction.reply({ content: 'Spell not found' });
				return;
			}
			// prettier-ignore
			const embed1 = new EmbedBuilder()
				.setColor(0x00ff00)
				.setTitle(spell.name)
				.setDescription(`*${spell.type}*⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`)
				.addFields(
					{ name: 'Casting Time: ', value: spell.casting_time },
					{ name: 'Range: ', value: spell.range },
					{ name: 'Components: ', value: spell.components },
					{ name: 'Duration: ', value: spell.duration },
				);

			const embed2 = new EmbedBuilder().setDescription(spell.description).setColor(0x00ff00).setTitle('Description: ');
			if (spell.higher_levels) {
				embed2.addFields({ name: 'At Higher Levels: ', value: spell.higher_levels });
			}
			embed2.addFields({ name: 'Spell Lists: ', value: spell.classes.toString().replace(/,/gi, ', '), inline: true });
			interaction.reply({ embeds: [embed1, embed2] });
			return;
		}
		else if (interaction.isAutocomplete()) {
			const focusedValue = interaction.options.getFocused();

			const choices = await db.spell.findMany({
				orderBy: {
					name: 'asc',
				},
				where: {
					name: {
						startsWith: focusedValue,
						mode: 'insensitive',
					},
				},
				select: {
					name: true,
				},
				take: 10,
			});

			await interaction.respond(choices.map((choice) => ({ name: choice.name, value: choice.name })));
		}
	},
};
