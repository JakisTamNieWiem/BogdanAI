import { PrismaClient } from '@prisma/client';
import { Interaction, Collection, SlashCommandBuilder } from 'discord.js';

declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, Command>
    }

    export interface Command {
        name: string,
        description: string,
		default: {
			execute: (message: Interaction, db?: PrismaClient) => Promise<void>
		}
    }
}