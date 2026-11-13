// Usage: node tools/gen_icon.js public/icons/icon.svg  (then render PNGs 512/192/180)
// Original Sofi10 app icon as SVG (full-bleed so it also works as a maskable icon).
const fs = require('fs');
const out = process.argv[2];
const FONT = `ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold','Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const card = (x, y, rot, fill, label) => `
<g transform="translate(${x} ${y}) rotate(${rot}) scale(1.3)">
  <rect x="-62" y="-86" width="124" height="172" rx="16" fill="#FFFDF7"/>
  <rect x="-62" y="-86" width="124" height="112" rx="16" fill="${fill}"/>
  <rect x="-62" y="10" width="124" height="16" fill="${fill}"/>
  <text x="0" y="0" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="74" fill="#fff">${label}</text>
</g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><radialGradient id="f" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#147A4F"/><stop offset="1" stop-color="#083D27"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#f)"/>
${card(186, 262, -14, '#2457C5', '1')}
${card(326, 262, 14, '#D7263D', '0')}
<text x="256" y="452" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="58" fill="#F2C14E" letter-spacing="4">SOFI</text>
</svg>`;
fs.writeFileSync(out, svg);
console.log('icon written');
