import { PrismaClient } from '@prisma/client';
import { LoremIpsum } from 'lorem-ipsum';
import { parseArgs } from 'node:util';
import spells from '../data/spells.json' with { type: 'json'};

const prisma = new PrismaClient();
const options = {
	table: { type: 'string' } as const,
};
const lorem = new LoremIpsum({
	wordsPerSentence: {
		min: 3,
		max: 10,
	},
});
async function main() {
	const {
		values: { table },
	} = parseArgs({ options });

	switch (table) {
		case 'npc': {
			seed_npc();
			break;
		}
		case 'quest': {
			seed_quest();
			break;
		}
		case 'spell': {
			seed_spell();
			break;
		}
		default: {
			seed_spell();
			seed_campaign();
			seed_quest();
			seed_npc();
			break;
		}
	}
}

async function seed_spell() {
	const spellData = spells.map((spell) => {
		return {
			name: spell.name,
			type: spell.type,
			casting_time: spell.casting_time,
			range: spell.range,
			components: spell.components.raw,
			duration: spell.duration,
			description: spell.description,
			higher_levels: spell.higher_levels,
			classes: spell.classes,
		};
	});
	await prisma.spell.createMany({
		data: spellData,
	});
}

async function seed_quest() {
	const data = Array.from({ length: 10 }, () => {
		return {
			name: lorem.generateWords(1),
			campaignId: 1,
			description: lorem.generateSentences(3).split('. '),
			shortDesc: lorem.generateWords(3),
			rewards: lorem.generateWords(3),
			location: lorem.generateWords(1),
		};
	});
	await prisma.quest.createMany({
		data: data,
	});
}
async function seed_campaign() {
	await prisma.campaign.create({
		data: {
			name: 'Test',
			dm: 'jakistamniewiem',
			players: ['jakistamniewiem'],
			guildId: 0,
		},
	});
}
async function seed_npc() {
	const data = Array.from({ length: 10 }, () => {
		return {
			name: lorem.generateWords(2),
			description: lorem.generateSentences(1),
			campaignId: 1,
			portrait: Buffer.from([1, 2, 3, 4]),
		};
	});
	await prisma.nPC.createMany({
		data: data,
	});
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error(e);
		await prisma.$disconnect();
		process.exit(1);
	});