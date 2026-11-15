'use client';
// How to play Rummy10 (Classic and Twist). Used on /how-to-play and inside the table menu during a game.
import { useState } from 'react';
import { RULESETS } from '@/lib/rulesets';

export default function HowToPlay({ edition }: { edition?: number }) {
	const [shown, setShown] = useState(edition === 2 ? 2 : 1);
	const rs = RULESETS.find(r => r.id === shown)!;
	return (
		<div className="howto">
			<p>Be the first to get through all <b>10 phases</b>. Each round everyone is dealt 10 cards and works on their own phase.</p>

			<h3>Your turn</h3>
			<ol>
				<li><b>Draw</b> one card: from the deck, or the top of the discard pile.</li>
				<li><b>Build</b> your phase. Tap a card, then tap a group. When every group is complete, tap <b>Lay Down</b>.</li>
				<li>After laying down, you may <b>add cards</b> to any laid-down group on the table (yours or anyone’s).</li>
				<li><b>Discard</b> one card to end your turn.</li>
			</ol>
			<p>Stuck? Tap <b>💡 Hint</b> on your turn. It shows which cards to keep, which to throw, and can arrange a complete phase for you.</p>

			<h3>The 10 phases</h3>
			<div className="segmented" role="radiogroup" aria-label="Rule set" style={{ marginBottom: 10 }}>
				{RULESETS.map(r => <label key={r.id}><input type="radio" name="howto-rules" checked={shown === r.id} onChange={() => setShown(r.id)} /><span>{r.name}{edition !== undefined && r.id === edition ? ' · this game' : ''}</span></label>)}
			</div>
			<p className="small" style={{ marginTop: 0 }}>{rs.blurb}</p>
			<ol className="phases">{rs.phases.map((p, i) => <li key={i}><span className="pn">{i + 1}</span>{p}</li>)}</ol>
			<p className="small"><b>Set</b> = cards of the same number (Red 7, Blue 7, Green 7). <b>Run</b> = numbers in order, any colours (3‑4‑5‑6). <b>Colour run</b> = numbers in order, all one colour.</p>

			<h3>Special cards</h3>
			<ul>
				<li><b>Wild</b> (8 in the deck) stands in for any card in a set, run or colour group.</li>
				<li><b>Skip</b> (4 in the deck): discard it and choose a player who misses their next turn. A Skip can’t be picked up from the discard pile.</li>
			</ul>

			<h3>End of a round</h3>
			<p>The round ends when someone plays or discards their last card. Players who laid down move to the next phase; the others try the same phase again. Cards left in your hand cost points:</p>
			<table className="pts"><tbody>
				<tr><td>1–9</td><td>5 points</td></tr>
				<tr><td>10–12</td><td>10 points</td></tr>
				<tr><td>Skip</td><td>15 points</td></tr>
				<tr><td>Wild</td><td>25 points</td></tr>
			</tbody></table>

			<h3>Winning</h3>
			<p>The first player to complete Phase 10 ends the game. The highest phase wins; if that’s a tie, the fewest points wins. Everyone earns leaderboard points for their place: with 4 players, 1st gets 4, 2nd gets 3, and so on. Games with Virtual Friends are practice and don’t count.</p>

			<h3>Fair play</h3>
			<ul>
				<li>With a turn timer, a turn that runs out is played for you.</li>
				<li>Miss <b>3 turns in a row</b> and you’re taken out so the table can carry on.</li>
				<li>The host can remove players or end the game, always with a reason.</li>
			</ul>
		</div>
	);
}
