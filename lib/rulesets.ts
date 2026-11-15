// The rule sets (editions) players can choose. Phase text must match the `phases` table (db/schema.sql).
export interface RuleSet { id: 1 | 2; name: string; blurb: string; phases: string[] }

export const RULESETS: RuleSet[] = [
	{
		id: 1, name: 'Classic', blurb: 'The familiar 10 phases: sets, runs and one colour.',
		phases: ['2 sets of 3', '1 set of 3 + 1 run of 4', '1 set of 4 + 1 run of 4', '1 run of 7', '1 run of 8', '1 run of 9', '2 sets of 4', '7 cards of one colour', '1 set of 5 + 1 set of 2', '1 set of 5 + 1 set of 3'],
	},
	{
		id: 2, name: 'Twist', blurb: 'Different phases, colour runs and big colour groups.',
		phases: ['3 sets of 3', '4 sets of 2', '1 set of 5 + 1 run of 4', '2 sets of 3 + 1 run of 3', '1 set of 3 + 1 run of 6', '2 runs of 4', '1 run of 4 + 4 cards of one colour', '1 colour run of 5 (same colour, in order)', '8 cards of one colour', '9 cards of one colour'],
	},
];
export const ruleSet = (id: number | null | undefined) => RULESETS.find(r => r.id === id) || RULESETS[0];
export const asEdition = (x: unknown): 1 | 2 => (Number(x) === 2 ? 2 : 1);
