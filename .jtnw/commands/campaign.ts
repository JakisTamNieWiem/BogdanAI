import { SlashCommandBuilder, BaseInteraction, EmbedBuilder } from "discord.js";
import logger from "@/logger.js";
import { db } from "@/db/index.js";
import { campaigns } from "@/db/schema.js";
import { eq, like } from "drizzle-orm";

export default {
	data: new SlashCommandBuilder()
			.setName("campaign")
			.setDescription("Manage D&D campaigns for your server")
			.addSubcommand(subcommand =>
				subcommand
					.setName("add-player")
					.setDescription("Add a player to a campaign (DM only)")
					.addStringOption(option =>
						option
							.setName("campaign")
							.setDescription("The campaign to add the player to")
							.setRequired(true)
							.setAutocomplete(true)
					)
					.addUserOption(option =>
						option
							.setName("player")
							.setDescription("The player to add")
							.setRequired(true)
					)
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName("create")
					.setDescription("Create a new campaign")
					.addStringOption(option =>
						option
							.setName("name")
							.setDescription("The name of the campaign")
							.setRequired(true)
					)
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName("delete")
					.setDescription("Delete a campaign (DM only)")
					.addStringOption(option =>
						option
							.setName("name")
							.setDescription("The name of the campaign to delete")
							.setRequired(true)
							.setAutocomplete(true)
					)
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName("info")
					.setDescription("View information about a campaign")
					.addStringOption(option =>
						option
							.setName("name")
							.setDescription("The name of the campaign")
							.setRequired(true)
							.setAutocomplete(true)
					)
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName("remove-player")
					.setDescription("Remove a player from a campaign (DM only)")
					.addStringOption(option =>
						option
							.setName("campaign")
							.setDescription("The campaign to remove the player from")
							.setRequired(true)
							.setAutocomplete(true)
					)
					.addUserOption(option =>
						option
							.setName("player")
							.setDescription("The player to remove")
							.setRequired(true)
					)
			),

	async execute(interaction: BaseInteraction) {
			// Handle autocomplete interactions
			if (interaction.isAutocomplete()) {
				await handleAutocomplete(interaction);
				return;
			}

			// Handle chat input command interactions
			if (!interaction.isChatInputCommand()) return;

			const subcommand = interaction.options.getSubcommand();

			logger.info(`Command ${interaction.commandName} with subcommand ${subcommand} executed`);

			switch (subcommand) {
				case "add-player":
					await handleAddPlayer(interaction);
					break;
				case "create":
					await handleCreate(interaction);
					break;
				case "delete":
					await handleDelete(interaction);
					break;
				case "info":
					await handleInfo(interaction);
					break;
				case "remove-player":
					await handleRemovePlayer(interaction);
					break;
				default:
					await interaction.reply({
						content: "Unknown subcommand",
						ephemeral: true
					});
			}
		}
};


async function handleAddPlayer(interaction: BaseInteraction) {
if (!interaction.isChatInputCommand())
      return;
    const campaignName = interaction.options.getString("campaign", !0), targetUser = interaction.options.getUser("player", !0), userId = interaction.user.id, username = interaction.user.tag;
    if (!targetUser) {
      await interaction.reply({
        content: "Invalid user specified.",
        ephemeral: !0
      });
      return;
    }
    try {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.name, campaignName)).limit(1);
      if (!campaign) {
        await interaction.reply({
          content: `Campaign "${campaignName}" not found.`,
          ephemeral: !0
        });
        return;
      }
      if (campaign.dm !== userId) {
        await interaction.reply({
          content: "Only the DM can add players to a campaign.",
          ephemeral: !0
        });
        return;
      }
      if (targetUser.id === userId) {
        await interaction.reply({
          content: "You cannot add yourself as a player. You are already the DM.",
          ephemeral: !0
        });
        return;
      }
      const currentPlayers = campaign.players;
      if (currentPlayers.includes(targetUser.id)) {
        await interaction.reply({
          content: `${targetUser.username} is already a player in this campaign.`,
          ephemeral: !0
        });
        return;
      }
      const updatedPlayers = [...currentPlayers, targetUser.id];
      await db.update(campaigns).set({ players: updatedPlayers }).where(eq(campaigns.id, campaign.id));
      logger.info(`User ${username} (${userId}) added player ${targetUser.tag} (${targetUser.id}) to campaign "${campaignName}"`);
      const embed = new EmbedBuilder().setTitle("Player Added! \uD83D\uDC65").setDescription(`Successfully added **${targetUser.username}** to campaign **${campaignName}**`).addFields({ name: "Campaign", value: campaignName, inline: !0 }, { name: "Added by", value: username, inline: !0 }, { name: "New Player", value: targetUser.toString(), inline: !0 }, {
        name: "Total Players",
        value: updatedPlayers.length.toString(),
        inline: !0
      }).setColor("Blue").setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error adding player:", error);
      await interaction.reply({
        content: "There was an error adding the player. Please try again.",
        ephemeral: !0
      });
    }
}
async function handleCreate(interaction: BaseInteraction) {
if (!interaction.isChatInputCommand())
      return;
    const campaignName = interaction.options.getString("name", !0), userId = interaction.user.id, username = interaction.user.tag, guildId = interaction.guild?.id;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: !0
      });
      return;
    }
    if (campaignName.length < 3 || campaignName.length > 100) {
      await interaction.reply({
        content: "Campaign name must be between 3 and 100 characters.",
        ephemeral: !0
      });
      return;
    }
    try {
      if ((await db.select().from(campaigns).where(eq(campaigns.name, campaignName)).limit(1)).length > 0) {
        await interaction.reply({
          content: `A campaign named "${campaignName}" already exists in this server.`,
          ephemeral: !0
        });
        return;
      }
      const [newCampaign] = await db.insert(campaigns).values({
        name: campaignName,
        dm: userId,
        players: [],
        guildId: parseInt(guildId)
      }).returning();
      if (!newCampaign) {
        await interaction.reply({
          content: "There was an error creating the campaign. Please try again.",
          ephemeral: !0
        });
        return;
      }
      logger.info(`User ${username} (${userId}) created campaign "${campaignName}"`);
      const embed = new EmbedBuilder().setTitle("Campaign Created! \uD83C\uDFB2").setDescription(`Successfully created campaign **${campaignName}**`).addFields({ name: "Campaign Name", value: campaignName, inline: !0 }, { name: "DM", value: username, inline: !0 }, { name: "Campaign ID", value: newCampaign.id.toString(), inline: !0 }, {
        name: "Players",
        value: "None yet. Use `/campaign add-player` to add players!",
        inline: !1
      }).setColor("Green").setTimestamp().setFooter({ text: "Use /campaign help for more commands" });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error creating campaign:", error);
      await interaction.reply({
        content: "There was an error creating the campaign. Please try again.",
        ephemeral: !0
      });
    }
}
async function handleDelete(interaction: BaseInteraction) {
if (!interaction.isChatInputCommand())
      return;
    const campaignName = interaction.options.getString("name", !0), userId = interaction.user.id, username = interaction.user.tag;
    try {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.name, campaignName)).limit(1);
      if (!campaign) {
        await interaction.reply({
          content: `Campaign "${campaignName}" not found.`,
          ephemeral: !0
        });
        return;
      }
      if (campaign.dm !== userId) {
        await interaction.reply({
          content: "Only the DM can delete a campaign.",
          ephemeral: !0
        });
        return;
      }
      await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
      logger.info(`User ${username} (${userId}) deleted campaign "${campaignName}"`);
      const embed = new EmbedBuilder().setTitle("Campaign Deleted \uD83D\uDDD1\uFE0F").setDescription(`Campaign **${campaignName}** has been deleted.`).addFields({ name: "Deleted by", value: username, inline: !0 }, { name: "Campaign ID", value: campaign.id.toString(), inline: !0 }).setColor("Red").setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error deleting campaign:", error);
      await interaction.reply({
        content: "There was an error deleting the campaign. Please try again.",
        ephemeral: !0
      });
    }
}
async function handleInfo(interaction: BaseInteraction) {
if (!interaction.isChatInputCommand())
      return;
    const campaignName = interaction.options.getString("name", !0);
    try {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.name, campaignName)).limit(1);
      if (!campaign) {
        await interaction.reply({
          content: `Campaign "${campaignName}" not found.`,
          ephemeral: !0
        });
        return;
      }
      const playerIds = campaign.players, playersText = playerIds.length > 0 ? playerIds.map((id) => `<@${id}>`).join(", ") : "No players yet";
      let dmDisplay = `<@${campaign.dm}>`;
      try {
        const dmUser = await interaction.client.users.fetch(campaign.dm);
        if (dmUser)
          dmDisplay = `${dmUser.tag}`;
      } catch (error) {
        logger.warn(`Could not fetch DM user ${campaign.dm}:`, error);
      }
      const embed = new EmbedBuilder().setTitle(`\uD83D\uDCCB ${campaign.name}`).setDescription("Campaign Information").addFields({ name: "Campaign ID", value: campaign.id.toString(), inline: !0 }, { name: "Dungeon Master", value: dmDisplay, inline: !0 }, {
        name: "Player Count",
        value: playerIds.length.toString(),
        inline: !0
      }, { name: "Players", value: playersText || "No players", inline: !1 }, { name: "Guild ID", value: campaign.guildId.toString(), inline: !0 }).setColor("Purple").setTimestamp().setFooter({
        text: "Use /campaign add-player to add players to this campaign"
      });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error fetching campaign info:", error);
      await interaction.reply({
        content: "There was an error fetching campaign information. Please try again.",
        ephemeral: !0
      });
    }
}
async function handleRemovePlayer(interaction: BaseInteraction) {
if (!interaction.isChatInputCommand())
      return;
    const campaignName = interaction.options.getString("campaign", !0), targetUser = interaction.options.getUser("player", !0), userId = interaction.user.id, username = interaction.user.tag;
    if (!targetUser) {
      await interaction.reply({
        content: "Invalid user specified.",
        ephemeral: !0
      });
      return;
    }
    try {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.name, campaignName)).limit(1);
      if (!campaign) {
        await interaction.reply({
          content: `Campaign "${campaignName}" not found.`,
          ephemeral: !0
        });
        return;
      }
      if (campaign.dm !== userId) {
        await interaction.reply({
          content: "Only the DM can remove players from a campaign.",
          ephemeral: !0
        });
        return;
      }
      const currentPlayers = campaign.players;
      if (!currentPlayers.includes(targetUser.id)) {
        await interaction.reply({
          content: `${targetUser.username} is not a player in this campaign.`,
          ephemeral: !0
        });
        return;
      }
      const updatedPlayers = currentPlayers.filter((playerId) => playerId !== targetUser.id);
      await db.update(campaigns).set({ players: updatedPlayers }).where(eq(campaigns.id, campaign.id));
      logger.info(`User ${username} (${userId}) removed player ${targetUser.tag} (${targetUser.id}) from campaign "${campaignName}"`);
      const embed = new EmbedBuilder().setTitle("Player Removed! \uD83D\uDC4B").setDescription(`Successfully removed **${targetUser.username}** from campaign **${campaignName}**`).addFields({ name: "Campaign", value: campaignName, inline: !0 }, { name: "Removed by", value: username, inline: !0 }, { name: "Removed Player", value: targetUser.toString(), inline: !0 }, {
        name: "Remaining Players",
        value: updatedPlayers.length.toString(),
        inline: !0
      }).setColor("Orange").setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error removing player:", error);
      await interaction.reply({
        content: "There was an error removing the player. Please try again.",
        ephemeral: !0
      });
    }
}

async function handleAutocomplete(interaction: BaseInteraction) {

}