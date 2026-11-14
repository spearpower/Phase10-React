// Virtual Friend difficulty, shown in the waiting room and on the practice page.
export const LEVELS = [
	{ v: 'easy', label: 'Easy', note: 'Relaxed: they miss chances and throw cards away at random.' },
	{ v: 'normal', label: 'Normal', note: 'They plan their phase and add to anyone’s groups.' },
	{ v: 'smart', label: 'Smart', note: 'They also avoid feeding you cards and skip whoever is about to go out.' },
] as const;
