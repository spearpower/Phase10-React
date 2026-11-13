// Card codes (same scheme as v1): `<copy><colour><number>` e.g. "1r7", "2g12";
// skips "1ss".."4ss", wilds "1ww".."8ww". The copy digit keeps duplicates unique.
// Pure helpers only: safe to import in the browser.
export type Card = string;
export type Colour = 'r' | 'b' | 'y' | 'g';
export const COLOURS: Colour[] = ['r', 'b', 'y', 'g'];
export const COLOUR_NAMES: Record<string, string> = { r: 'Red', b: 'Blue', y: 'Yellow', g: 'Green' };

export const isWild = (c: Card) => c[1] === 'w';
export const isSkip = (c: Card) => c[1] === 's';
export const colourOf = (c: Card) => c[1];
export const numberOf = (c: Card) => (isWild(c) || isSkip(c) ? 0 : parseInt(c.slice(2), 10));
/** Image name without the copy digit: "r7", "ww", "ss" */
export const faceOf = (c: Card) => c.slice(1);

export function cardLabel(c: Card): string {
	if (isWild(c)) return 'Wild';
	if (isSkip(c)) return 'Skip';
	return `${COLOUR_NAMES[colourOf(c)]} ${numberOf(c)}`;
}

/** Penalty points for a card left in hand at the end of a round. */
export function penalty(c: Card): number {
	if (isWild(c)) return 25;
	if (isSkip(c)) return 15;
	return numberOf(c) >= 10 ? 10 : 5;
}
