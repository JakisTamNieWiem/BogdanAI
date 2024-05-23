import { PrismaClient } from '@prisma/client';
import spells from '../data/spells.json' with { type: 'json'};
const prisma = new PrismaClient();
async function main() {
	Promise.all(
		spells.map((spell) => {
			const response = prisma.spell.create({
				data: {
					name: spell.name,
					type: spell.type,
					casting_time: spell.casting_time,
					range: spell.range,
					components: spell.components.raw,
					duration: spell.duration,
					description: spell.description,
					higher_levels: spell.higher_levels,
					classes: spell.classes,
				},
			});
			return response;
		}),
	);
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