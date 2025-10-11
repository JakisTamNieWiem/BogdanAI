import {
	ApplicationIntegrationType,
	AttachmentBuilder,
	BaseInteraction,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";

//  ['Death-XII', 'Strength-XI', 'The Chariot-VII', 'The Devil-XV', 'The Lovers-VI', 'The Moon-XVIII', 'The Sun-XIX']
const CARDS_DIR =
	"C:\\Users\\noleo\\Desktop\\Programowanie\\JS\\Overseer\\bot\\data\\images\\tarot\\";

export default {
	data: new SlashCommandBuilder()
		.setName("tarot")
		.setDescription("Roll for tarot cards")
		.addIntegerOption((option) =>
			option
				.setName("tier")
				.setDescription("Choose weapon tier")
				.addChoices(
					{ name: "Tier 1", value: 1 },
					{ name: "Tier 2", value: 2 },
					{ name: "Tier 3", value: 3 },
				),
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
			await interaction.deferReply();
			const tier = interaction.options.getInteger("tier") ?? 1;

			const card = Math.floor(Math.random() * tier * 7) + 7 * (tier - 1);

			const image = new AttachmentBuilder(CARDS_DIR + `Roll-${card}.webp`);
			await interaction.followUp({ files: [image] });
		}
	},
};
