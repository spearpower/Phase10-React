// Usage: node tools/gen_cards.js public/imgs/cards/s10
// Generates the original Sofi10 card set as SVG (viewBox 143x194, same ratio as the old PNGs).
// Each colour also has its own shape so colour is never the only cue (HIG accessibility).
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

const W = 143, H = 194, R = 14;
const FONT = `ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold','Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const PAPER = '#FFFDF7';
const colours = {
  r: { fill: '#D7263D', dark: '#9E1528', name: 'Red' },
  b: { fill: '#2457C5', dark: '#163A8A', name: 'Blue' },
  y: { fill: '#F0B21C', dark: '#B07F00', name: 'Yellow', ink: '#2A1E00' },
  g: { fill: '#178A4C', dark: '#0C5E32', name: 'Green' },
};

// shape glyphs centred at (cx,cy) with size s
function shape(c, cx, cy, s, fill) {
  const h = s / 2;
  switch (c) {
    case 'r': return `<circle cx="${cx}" cy="${cy}" r="${h}" fill="${fill}"/>`;
    case 'b': return `<rect x="${cx - h * 0.88}" y="${cy - h * 0.88}" width="${s * 0.88}" height="${s * 0.88}" rx="${s * 0.12}" fill="${fill}"/>`;
    case 'y': return `<path d="M${cx} ${cy - h} L${cx + h} ${cy + h * 0.8} L${cx - h} ${cy + h * 0.8} Z" fill="${fill}" stroke="${fill}" stroke-width="${s * 0.08}" stroke-linejoin="round"/>`;
    case 'g': return `<path d="M${cx} ${cy - h} L${cx + h} ${cy} L${cx} ${cy + h} L${cx - h} ${cy} Z" fill="${fill}" stroke="${fill}" stroke-width="${s * 0.08}" stroke-linejoin="round"/>`;
  }
}

const frame = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${R}" fill="${bg}" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>
${inner}
</svg>`;

// Numbered card: colour field on top, paper footer with the colour's shape.
function numbered(c, n) {
  const k = colours[c];
  const big = n >= 10 ? 64 : 84; const ink = k.ink || "#fff";
  const inner = `
<path d="M1 ${R + 1} a${R - 1} ${R - 1} 0 0 1 ${R - 1} -${R - 1} H${W - R - 1} a${R - 1} ${R - 1} 0 0 1 ${R - 1} ${R - 1} V132 H1 Z" fill="${k.fill}"/>
<path d="M1 132 H${W - 1}" stroke="${k.dark}" stroke-width="2"/>
<text x="12" y="31" font-family="${FONT}" font-weight="800" font-size="24" fill="${ink}">${n}</text>
${shape(c, 21, 44, 11, ink)}
<text x="${W / 2 + 6}" y="${n >= 10 ? 104 : 110}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${big}" fill="${ink}" letter-spacing="-2" fill-opacity="1" data-i="1">${n}</text>
${shape(c, W / 2, 163, 30, k.fill)}`;
  return frame(inner, PAPER);
}

function wild() {
  const cx = W / 2, cy = 84, r = 34;
  const q = (a0, a1, f) => {
    const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `<path d="M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${f}"/>`;
  };
  const P = Math.PI;
  const inner = `
${q(-P, -P / 2, colours.r.fill)}${q(-P / 2, 0, colours.b.fill)}${q(0, P / 2, colours.g.fill)}${q(P / 2, P, colours.y.fill)}
<circle cx="${cx}" cy="${cy}" r="13" fill="#1B1D26"/>
<text x="12" y="31" font-family="${FONT}" font-weight="800" font-size="22" fill="#fff">W</text>
<text x="${cx}" y="160" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="30" fill="#fff" letter-spacing="2">WILD</text>`;
  return frame(inner, '#1B1D26');
}

function skip() {
  const cx = W / 2, cy = 84;
  const inner = `
<circle cx="${cx}" cy="${cy}" r="32" fill="none" stroke="#FF8A3D" stroke-width="10"/>
<path d="M${cx - 22} ${cy + 22} L${cx + 22} ${cy - 22}" stroke="#FF8A3D" stroke-width="10" stroke-linecap="round"/>
<text x="12" y="31" font-family="${FONT}" font-weight="800" font-size="22" fill="#fff">S</text>
<text x="${cx}" y="160" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="30" fill="#fff" letter-spacing="2">SKIP</text>`;
  return frame(inner, '#2A2D3A');
}

function back() {
  let lines = '';
  for (let i = -H; i < W + H; i += 12) lines += `<path d="M${i} 0 L${i + H} ${H}" stroke="rgba(255,255,255,.06)" stroke-width="4"/>`;
  const inner = `
<clipPath id="c"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${R}"/></clipPath>
<g clip-path="url(#c)">${lines}</g>
<rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="${R - 6}" fill="none" stroke="#F2C14E" stroke-width="2.5"/>
<circle cx="${W / 2}" cy="${H / 2}" r="38" fill="#F2C14E"/>
<text x="${W / 2}" y="${H / 2 + 3}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="34" fill="#0B4A30">S10</text>
<text x="${W / 2}" y="${H / 2 + 20}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="9" fill="#0B4A30" letter-spacing="2">SOFI</text>`;
  return frame(inner, '#0E5A3A');
}

for (const c of Object.keys(colours)) for (let n = 1; n <= 12; n++) fs.writeFileSync(path.join(out, `${c}${n}.svg`), numbered(c, n));
for (const f of ['w', 'ww']) fs.writeFileSync(path.join(out, `${f}.svg`), wild());
for (const f of ['s', 'ss']) fs.writeFileSync(path.join(out, `${f}.svg`), skip());
fs.writeFileSync(path.join(out, 'back.svg'), back());
console.log('cards written:', fs.readdirSync(out).length);
