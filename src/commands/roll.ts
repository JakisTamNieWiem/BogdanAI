import { BaseInteraction, SlashCommandBuilder } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('roll')
		.setDescription('rolls dice')
		.addStringOption((option) => option.setName('message').setDescription('spell name').setRequired(true)),
	async execute(interaction: BaseInteraction) {

	},
};