export type DamageType =
	| "slashing"
	| "piercing"
	| "bludgeoning"
	| "fire"
	| "cold"
	| "acid"
	| "poison"
	| "lightning"
	| "thunder"
	| "force"
	| "psychic"
	| "necrotic"
	| "radiant";

export interface DiceRoll {
	numDice: number;
	numSides: number;
	modifier?: number;
	damageType?: DamageType;
}

export interface ParsedRoll {
	rolls: DiceRoll[];
	comment?: string;
}
