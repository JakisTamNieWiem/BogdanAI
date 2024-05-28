import { PrismaClient } from '@prisma/client';
import { BaseInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('quests')
		.setDescription('quests')
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('List all quests in a campaign')
				.addStringOption(option => option.setName('campaign').setDescription('Campaign that the quests belong to.').setAutocomplete(true).setRequired(true)),
		).addSubcommand(subcommand =>
			subcommand
				.setName('add')
				.setDescription('Add a quests to a campaign.')
				.addStringOption(option => option.setName('campaign').setDescription('Campaign that the quest will belong to.').setAutocomplete(true).setRequired(true))
				.addStringOption(option => option.setName('name').setDescription('Name of the quest.').setRequired(true))
				.addStringOption(option => option.setName('location').setDescription('Location of the quest.').setRequired(true))
				.addStringOption(option => option.setName('rewards').setDescription('Rewards of the quest.').setRequired(true))
				.addStringOption(option => option.setName('npc').setDescription('Name of the npc thats giving the quest.').setAutocomplete(true)),
		).addSubcommand(subcommand =>
			subcommand
				.setName('edit')
				.setDescription('Edit a quests.')
				.addStringOption(option => option.setName('quest').setDescription('Name of the quest.').setAutocomplete(true).setRequired(true)),
		).addSubcommand(subcommand =>
			subcommand
				.setName('delete')
				.setDescription('Delete a quests.')
				.addStringOption(option => option.setName('quest').setDescription('Name of the quest.').setAutocomplete(true).setRequired(true)),
		).addSubcommand(subcommand =>
			subcommand
				.setName('inspect')
				.setDescription('Show details about a quests.')
				.addStringOption(option => option.setName('quest').setDescription('Name of the quest.').setAutocomplete(true).setRequired(true)),
		),
	async execute(interaction: BaseInteraction, db: PrismaClient) {
		if (interaction.isChatInputCommand()) {
			switch (interaction.options.getSubcommand()) {
				case 'list': {
					const quests = await db.quest.findMany({
						where: {
							campaign: {
								name: interaction.options.getString('campaign') ?? '',
							},
						},
						select: {
							name: true,
							shortDesc: true,
						},
					});
					const emedFields = quests.map((quest) => { return { name: quest.name, value: quest.shortDesc }; });
					const questListEmbed = new EmbedBuilder()
						.setColor(0x00ff00)
						.setTitle(`${interaction.options.getString('campaign')} - Quests`)
						.addFields(emedFields);
					interaction.reply({ embeds: [questListEmbed] });
					break;
				}

				case 'add': {
					const campaignId = (await db.campaign.findFirst({
						where: {
							name: interaction.options.getString('campaign', true),
							dm: interaction.member?.user.username,
						},
					}))?.id;
					const npcId = (await db.nPC.findFirst({
						where: {
							campaignId: campaignId,
							name: interaction.options.getString('npc', true),
						},
					}))?.id;


					const quest = await db.quest.create({
						data: {
							name: interaction.options.getString('name', true),
							campaign: {
								connect: {
									id: campaignId,
								},
							},
							description: [],
							shortDesc: '',
							NPC: {
								connect: {
									id: npcId,
								},
							},
							location: interaction.options.getString('location', true),
							rewards: interaction.options.getString('rewards', true),
						},
					});
					interaction.reply('Quest created succesfully!');
					break;
				}
				case 'edit':
					break;
				case 'delete':
					break;
				case 'inspect':
					break;
			}
		}
		else if (interaction.isAutocomplete()) {
			const focusedValue = interaction.options.getFocused(true);
			// const choices = focusedValue.name === 'campaign' ? await db.campaign.findMany({
			// 	where: {
			// 		OR: [
			// 			{ dm: interaction.member?.user.username },
			// 			{ players: { has: interaction.member?.user.username } },
			// 		],
			// 		name: {
			// 			startsWith: focusedValue.value,
			// 			mode: 'insensitive',
			// 		},
			// 	},
			// 	select: {
			// 		name: true,
			// 	},
			// 	orderBy: {
			// 		name: 'asc',
			// 	},
			// 	take: 10,
			// }) : focusedValue.name === 'npc' ? await db.nPC.findMany({
			// 	where: {
			// 		campaign: {
			// 			OR: [
			// 				{ dm: interaction.member?.user.username },
			// 				{ players: { has: interaction.member?.user.username } },
			// 			],
			// 		},
			// 		name: {
			// 			startsWith: focusedValue.value,
			// 			mode: 'insensitive',
			// 		},
			// 	},
			// 	select: {
			// 		name: true,
			// 	},
			// 	orderBy: {
			// 		name: 'asc',
			// 	},
			// 	take: 10,
			// })
			// 	: await db.quest.findMany({
			// 		where: {
			// 			campaign: {
			// 				OR: [
			// 					{ dm: interaction.member?.user.username },
			// 					{ players: { has: interaction.member?.user.username } },
			// 				],
			// 			},
			// 			name: {
			// 				startsWith: focusedValue.value,
			// 				mode: 'insensitive',
			// 			},
			// 		},
			// 		select: {
			// 			name: true,
			// 		},
			// 		orderBy: {
			// 			name: 'asc',
			// 		},
			// 		take: 10,
			// 	});
			const choices = await db.campaign.findMany({
				where: {
					OR: [
						{ dm: interaction.member?.user.username },
						{ players: { has: interaction.member?.user.username } },
					],
					name: {
						startsWith: focusedValue.value,
						mode: 'insensitive',
					},
				},
				select: {
					name: true,
					NPC: {
						select: {
							name: true,
						},
						orderBy: {
							name: 'asc',
						},
						take: 10,
					},
					quest: {
						select: {
							name: true,
						},
						orderBy: {
							name: 'asc',
						},
						take: 10,
					},
				},
				orderBy: {
					name: 'asc',
				},
				take: 10,
			});
			if (focusedValue.name === 'campaign') {
				await interaction.respond(choices.map((campaign) => {
					return { name: campaign.name, value: campaign.name };
				}));
			}
			else if (focusedValue.name === 'npc') {
				await interaction.respond(choices.flatMap((campaign) => {
					return campaign.NPC;
				}).map((npc) => {
					return { name: npc.name, value: npc.name };
				}));
			}
			else if (focusedValue.name === 'quest') {
				await interaction.respond(choices.flatMap((campaign) => {
					return campaign.quest;
				}).map((quest) => {
					return { name: quest.name, value: quest.name };
				}));
			}


		}

	},
};