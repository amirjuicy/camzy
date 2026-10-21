/* ================================================================
   Camzy — CCTV asset generator
   Produces: brand wordmarks, category icons and product illustrations
   as flat, dependency-free SVG (no gradients, no filters).
   ================================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || 'C:/Users/INO/Desktop/project/camzy';
const IMG = path.join(ROOT, 'assets', 'images');

const NAVY = '#0B3C5D';
const CYAN = '#00B4D8';
const DARK = '#13293F';
const SLATE = '#4A6076';
const GREY = '#94A6B8';
const LINE = '#D3DEE7';
const LIGHT = '#EDF2F6';
const BG = '#F4F8FA';

function svg(body, w, h, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` +
    (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : '') + body + `</svg>`;
}

/* ───────────────────────── product illustrations ───────────────────────── */
const P = {};

/* Bullet camera: housing + lens + IR leds + bracket */
P.bullet = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="40" y="196" width="150" height="10" rx="5" fill="${GREY}"/>
  <rect x="168" y="176" width="18" height="50" rx="6" fill="${SLATE}"/>
  <path d="M186 186h34a14 14 0 0 1 14 14v92a14 14 0 0 1-14 14h-34z" fill="${NAVY}"/>
  <path d="M186 186h14v120h-14a6 6 0 0 1-6-6v-108a6 6 0 0 1 6-6z" fill="${DARK}"/>
  <ellipse cx="236" cy="246" rx="30" ry="44" fill="${DARK}"/>
  <ellipse cx="236" cy="246" rx="20" ry="32" fill="${accent}"/>
  <ellipse cx="230" cy="236" rx="7" ry="11" fill="#EAF6FA" opacity=".85"/>
  <circle cx="258" cy="212" r="7" fill="${CYAN}"/>
  <circle cx="258" cy="280" r="7" fill="${CYAN}"/>
  <circle cx="210" cy="212" r="7" fill="${CYAN}"/>
  <circle cx="210" cy="280" r="7" fill="${CYAN}"/>
  <path d="M186 306h34l-8 22h-18z" fill="${SLATE}"/>
`, 400, 400);

/* Dome camera */
P.dome = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <path d="M118 196h164l-26 26H144z" fill="${GREY}"/>
  <rect x="140" y="176" width="120" height="26" rx="8" fill="${SLATE}"/>
  <path d="M120 200h160v18a80 80 0 0 1-160 0z" fill="${NAVY}"/>
  <path d="M120 200h160v12a80 80 0 0 0-160 0z" fill="${DARK}" opacity=".55"/>
  <circle cx="200" cy="252" r="52" fill="${DARK}"/>
  <circle cx="200" cy="252" r="34" fill="${accent}"/>
  <circle cx="188" cy="238" r="11" fill="#EAF6FA" opacity=".85"/>
  <circle cx="246" cy="214" r="6" fill="${CYAN}"/>
  <circle cx="246" cy="290" r="6" fill="${CYAN}"/>
  <circle cx="154" cy="214" r="6" fill="${CYAN}"/>
  <circle cx="154" cy="290" r="6" fill="${CYAN}"/>
`, 400, 400);

/* Turret camera */
P.turret = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="138" y="150" width="124" height="120" rx="16" fill="${NAVY}"/>
  <path d="M138 166a16 16 0 0 1 16-16h92a16 16 0 0 1 16 16v10H138z" fill="${DARK}"/>
  <circle cx="200" cy="212" r="34" fill="${DARK}"/>
  <circle cx="200" cy="212" r="22" fill="${accent}"/>
  <circle cx="192" cy="202" r="7" fill="#EAF6FA" opacity=".85"/>
  <circle cx="244" cy="176" r="6" fill="${CYAN}"/>
  <circle cx="156" cy="176" r="6" fill="${CYAN}"/>
  <rect x="120" y="268" width="160" height="14" rx="7" fill="${GREY}"/>
`, 400, 400);

/* PTZ / pan-tilt */
P.ptz = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <ellipse cx="200" cy="322" rx="86" ry="16" fill="${GREY}"/>
  <rect x="168" y="276" width="64" height="46" rx="10" fill="${SLATE}"/>
  <path d="M148 168h104a16 16 0 0 1 16 16v76a16 16 0 0 1-16 16h-104a16 16 0 0 1-16-16v-76a16 16 0 0 1 16-16z" fill="${NAVY}"/>
  <path d="M148 168h104a16 16 0 0 1 16 16v12H132v-12a16 16 0 0 1 16-16z" fill="${DARK}"/>
  <circle cx="182" cy="224" r="32" fill="${DARK}"/>
  <circle cx="182" cy="224" r="20" fill="${accent}"/>
  <circle cx="175" cy="216" r="7" fill="#EAF6FA" opacity=".85"/>
  <circle cx="236" cy="200" r="12" fill="${CYAN}" opacity=".9"/>
  <circle cx="236" cy="244" r="12" fill="${CYAN}" opacity=".9"/>
`, 400, 400);

/* NVR / DVR recorder */
P.recorder = (accent, label) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="74" y="130" width="252" height="150" rx="16" fill="${NAVY}"/>
  <rect x="74" y="130" width="252" height="150" rx="16" fill="none" stroke="${DARK}" stroke-width="3"/>
  <rect x="96" y="156" width="150" height="96" rx="8" fill="${DARK}"/>
  <rect x="106" y="166" width="130" height="76" rx="4" fill="${accent}" opacity=".85"/>
  <circle cx="126" cy="186" r="8" fill="#EAF6FA" opacity=".9"/>
  <circle cx="290" cy="172" r="8" fill="${CYAN}"/>
  <circle cx="290" cy="200" r="8" fill="${GREY}"/>
  <circle cx="290" cy="228" r="8" fill="${GREY}"/>
  <rect x="258" y="250" width="56" height="10" rx="5" fill="${SLATE}"/>
  <text x="200" y="312" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700" fill="${SLATE}">${label}</text>
`, 400, 400);

/* Alarm control panel */
P.alarm = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="116" y="104" width="168" height="196" rx="16" fill="${NAVY}"/>
  <rect x="136" y="128" width="128" height="80" rx="8" fill="${DARK}"/>
  <rect x="146" y="138" width="108" height="60" rx="4" fill="${accent}" opacity=".85"/>
  <circle cx="166" cy="236" r="9" fill="${CYAN}"/>
  <circle cx="200" cy="236" r="9" fill="${GREY}"/>
  <circle cx="234" cy="236" r="9" fill="${GREY}"/>
  <rect x="150" y="262" width="100" height="22" rx="6" fill="${SLATE}"/>
  <path d="M148 104l-14-24M252 104l14-24" stroke="${GREY}" stroke-width="5" stroke-linecap="round"/>
`, 400, 400);

/* Access control reader */
P.access = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="132" y="92" width="136" height="216" rx="18" fill="${NAVY}"/>
  <rect x="150" y="112" width="100" height="92" rx="10" fill="${DARK}"/>
  <rect x="162" y="124" width="76" height="56" rx="5" fill="${accent}" opacity=".9"/>
  <circle cx="200" cy="236" r="16" fill="${CYAN}"/>
  <circle cx="200" cy="236" r="7" fill="#EAF6FA"/>
  <rect x="166" y="272" width="68" height="14" rx="6" fill="${SLATE}"/>
`, 400, 400);

/* Turnstile */
P.turnstile = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="64" y="140" width="272" height="30" rx="10" fill="${NAVY}"/>
  <rect x="64" y="244" width="272" height="30" rx="10" fill="${NAVY}"/>
  <rect x="80" y="170" width="28" height="74" rx="8" fill="${SLATE}"/>
  <rect x="292" y="170" width="28" height="74" rx="8" fill="${SLATE}"/>
  <path d="M132 170v74M200 170v74M268 170v74" stroke="${CYAN}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="132" cy="207" r="9" fill="${CYAN}"/>
  <circle cx="200" cy="207" r="9" fill="${CYAN}"/>
  <circle cx="268" cy="207" r="9" fill="${CYAN}"/>
`, 400, 400);

/* Fire alarm bell */
P.firealarm = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="140" y="150" width="120" height="130" rx="14" fill="${NAVY}"/>
  <path d="M128 150h144l-18-30h-108z" fill="${DARK}"/>
  <circle cx="200" cy="212" r="42" fill="${accent}" opacity=".9"/>
  <circle cx="200" cy="212" r="26" fill="${DARK}" opacity=".55"/>
  <circle cx="188" cy="198" r="7" fill="#FFF" opacity=".8"/>
  <rect x="168" y="280" width="64" height="14" rx="6" fill="${SLATE}"/>
`, 400, 400);

/* Camera lens */
P.lens = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <circle cx="200" cy="200" r="118" fill="${NAVY}"/>
  <circle cx="200" cy="200" r="96" fill="${DARK}"/>
  <circle cx="200" cy="200" r="70" fill="${accent}" opacity=".9"/>
  <circle cx="200" cy="200" r="46" fill="${DARK}"/>
  <circle cx="200" cy="200" r="26" fill="#07131F"/>
  <circle cx="178" cy="176" r="14" fill="#EAF6FA" opacity=".8"/>
  <g fill="${GREY}">
    <circle cx="200" cy="66" r="9"/><circle cx="334" cy="200" r="9"/>
    <circle cx="200" cy="334" r="9"/><circle cx="66" cy="200" r="9"/>
  </g>
`, 400, 400);

/* Dome housing / camera case */
P.housing = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <path d="M200 96l96 54v108l-96 54-96-54V150z" fill="${NAVY}"/>
  <path d="M200 96l96 54-96 54-96-54z" fill="${DARK}" opacity=".5"/>
  <circle cx="200" cy="204" r="46" fill="${DARK}"/>
  <circle cx="200" cy="204" r="30" fill="${CYAN}" opacity=".9"/>
  <path d="M200 150v108" stroke="${GREY}" stroke-width="5"/>
`, 400, 400);

/* PoE switch */
P.switch = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="48" y="150" width="304" height="104" rx="14" fill="${NAVY}"/>
  <rect x="48" y="150" width="304" height="104" rx="14" fill="none" stroke="${DARK}" stroke-width="3"/>
  <g fill="${DARK}">
    <rect x="70" y="182" width="38" height="40" rx="5"/><rect x="118" y="182" width="38" height="40" rx="5"/>
    <rect x="166" y="182" width="38" height="40" rx="5"/><rect x="214" y="182" width="38" height="40" rx="5"/>
    <rect x="262" y="182" width="38" height="40" rx="5"/>
  </g>
  <g fill="${accent}"><rect x="76" y="188" width="8" height="8" rx="2"/><rect x="124" y="188" width="8" height="8" rx="2"/>
  <rect x="172" y="188" width="8" height="8" rx="2"/><rect x="220" y="188" width="8" height="8" rx="2"/>
  <rect x="268" y="188" width="8" height="8" rx="2"/></g>
  <rect x="312" y="182" width="24" height="40" rx="5" fill="${SLATE}"/>
  <g stroke="${GREY}" stroke-width="6" stroke-linecap="round">
    <path d="M96 254v26M240 254v26M324 254v26"/>
  </g>
`, 400, 400);

/* Wireless repeater */
P.repeater = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="150" y="140" width="100" height="140" rx="16" fill="${NAVY}"/>
  <circle cx="200" cy="200" r="30" fill="${DARK}"/>
  <path d="M176 200a24 24 0 0 1 48 0" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="200" cy="200" r="7" fill="${accent}"/>
  <path d="M160 176a56 56 0 0 0 0 48M240 176a56 56 0 0 1 0 48" fill="none" stroke="${CYAN}" stroke-width="5" stroke-linecap="round" opacity=".8"/>
  <rect x="170" y="280" width="60" height="10" rx="5" fill="${GREY}"/>
`, 400, 400);

/* Network cable box */
P.cablebox = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="80" y="140" width="240" height="140" rx="14" fill="${NAVY}"/>
  <rect x="100" y="160" width="200" height="100" rx="10" fill="${DARK}"/>
  <circle cx="200" cy="210" r="42" fill="${CYAN}" opacity=".9"/>
  <circle cx="200" cy="210" r="18" fill="${DARK}"/>
  <path d="M120 292l40 44h80l40-44" fill="none" stroke="${SLATE}" stroke-width="10" stroke-linecap="round"/>
`, 400, 400);

/* Camera bracket */
P.bracket = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="52" y="150" width="40" height="120" rx="8" fill="${SLATE}"/>
  <g fill="${GREY}"><circle cx="72" cy="172" r="7"/><circle cx="72" cy="248" r="7"/></g>
  <path d="M92 190h86a16 16 0 0 1 16 16v34a16 16 0 0 1-16 16H92z" fill="${NAVY}"/>
  <circle cx="72" cy="270" r="26" fill="${DARK}"/>
  <circle cx="72" cy="270" r="16" fill="${CYAN}" opacity=".85"/>
`, 400, 400);

/* Power adapter */
P.adapter = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="110" y="130" width="180" height="150" rx="22" fill="${NAVY}"/>
  <rect x="134" y="156" width="132" height="98" rx="10" fill="${DARK}"/>
  <rect x="150" y="172" width="100" height="66" rx="6" fill="${CYAN}" opacity=".85"/>
  <rect x="174" y="96" width="16" height="40" rx="6" fill="${SLATE}"/>
  <rect x="212" y="96" width="16" height="40" rx="6" fill="${SLATE}"/>
  <path d="M240 280c30 12 30 42 0 54" fill="none" stroke="${GREY}" stroke-width="7" stroke-linecap="round"/>
`, 400, 400);

/* Safety helmet */
P.helmet = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <path d="M104 246a96 96 0 0 1 192 0z" fill="${CYAN}"/>
  <path d="M104 246h192v18a10 10 0 0 1-10 10H114a10 10 0 0 1-10-10z" fill="${NAVY}"/>
  <path d="M170 160h60v86h-60z" fill="${NAVY}"/>
  <path d="M104 236c-26 10-34 30-30 44h46z" fill="${NAVY}"/>
  <path d="M296 236c26 10 34 30 30 44h-46z" fill="${NAVY}"/>
  <rect x="150" y="274" width="100" height="12" rx="6" fill="${SLATE}"/>
`, 400, 400);

/* Insulated gloves */
P.gloves = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <path d="M132 300V168a16 16 0 0 1 32 0v44h10V150a16 16 0 0 1 32 0v62h10V166a16 16 0 0 1 32 0v90a16 16 0 0 1 16-14v58c0 44-24 60-60 60h-14c-34 0-58-22-58-60z" fill="${NAVY}"/>
  <path d="M148 300v-88a16 16 0 0 1 32 0v44h10V150a16 16 0 0 1 32 0v62h10V166a16 16 0 0 1 32 0v90" fill="none" stroke="${DARK}" stroke-width="4"/>
  <rect x="132" y="298" width="132" height="26" rx="10" fill="${CYAN}" opacity=".85"/>
`, 400, 400);

/* Wall rack */
P.rack = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="106" y="72" width="188" height="256" rx="10" fill="${NAVY}"/>
  <rect x="126" y="92" width="148" height="216" rx="6" fill="${DARK}"/>
  <g fill="${SLATE}">
    <rect x="140" y="110" width="120" height="26" rx="4"/><rect x="140" y="152" width="120" height="26" rx="4"/>
    <rect x="140" y="194" width="120" height="26" rx="4"/><rect x="140" y="236" width="120" height="26" rx="4"/>
  </g>
  <g fill="${CYAN}"><circle cx="152" cy="123" r="4"/><circle cx="152" cy="207" r="4"/></g>
  <rect x="176" y="308" width="48" height="20" rx="4" fill="${GREY}"/>
`, 400, 400);

/* Floor cabinet */
P.cabinet = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="96" y="70" width="208" height="250" rx="10" fill="${NAVY}"/>
  <rect x="116" y="90" width="168" height="200" rx="6" fill="${DARK}"/>
  <g fill="${SLATE}">
    <rect x="132" y="110" width="136" height="28" rx="4"/><rect x="132" y="154" width="136" height="28" rx="4"/>
    <rect x="132" y="198" width="136" height="28" rx="4"/>
  </g>
  <rect x="278" y="160" width="8" height="26" rx="4" fill="${CYAN}"/>
  <rect x="130" y="320" width="24" height="16" rx="4" fill="${GREY}"/>
  <rect x="246" y="320" width="24" height="16" rx="4" fill="${GREY}"/>
`, 400, 400);

/* Test probe */
P.probe = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="120" y="120" width="160" height="150" rx="16" fill="${NAVY}"/>
  <circle cx="160" cy="176" r="24" fill="${DARK}"/>
  <circle cx="160" cy="176" r="13" fill="${CYAN}"/>
  <circle cx="222" cy="176" r="18" fill="${DARK}"/>
  <circle cx="222" cy="176" r="8" fill="${GREY}"/>
  <rect x="146" y="222" width="108" height="26" rx="6" fill="${SLATE}"/>
  <path d="M280 168c40 0 44 54 84 54" fill="none" stroke="${GREY}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="366" cy="222" r="12" fill="${NAVY}"/>
  <circle cx="366" cy="222" r="5" fill="${CYAN}"/>
`, 400, 400);

/* Cable tester */
P.tester = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="96" y="118" width="208" height="164" rx="16" fill="${NAVY}"/>
  <rect x="116" y="140" width="168" height="70" rx="8" fill="${DARK}"/>
  <text x="200" y="190" text-anchor="middle" font-family="Consolas, monospace" font-size="42" font-weight="700" fill="${CYAN}">88</text>
  <g fill="${SLATE}"><rect x="124" y="228" width="52" height="32" rx="6"/><rect x="188" y="228" width="52" height="32" rx="6"/>
  <rect x="252" y="228" width="32" height="32" rx="6"/></g>
  <path d="M304 244c32 0 34 44 62 44" fill="none" stroke="${GREY}" stroke-width="8" stroke-linecap="round"/>
  <rect x="350" y="272" width="34" height="34" rx="6" fill="${NAVY}"/>
`, 400, 400);

/* Hard disk drive */
P.hdd = (accent) => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="70" y="110" width="260" height="180" rx="10" fill="${NAVY}"/>
  <rect x="70" y="110" width="260" height="180" rx="10" fill="none" stroke="${DARK}" stroke-width="3"/>
  <circle cx="200" cy="200" r="66" fill="${DARK}"/>
  <circle cx="200" cy="200" r="46" fill="${accent}" opacity=".9"/>
  <circle cx="200" cy="200" r="16" fill="${DARK}"/>
  <circle cx="168" cy="168" r="10" fill="#EAF6FA" opacity=".7"/>
  <g fill="${GREY}"><rect x="88" y="140" width="46" height="18" rx="4"/><rect x="88" y="242" width="46" height="18" rx="4"/></g>
  <g fill="${SLATE}"><rect x="300" y="134" width="16" height="132" rx="4"/></g>
`, 400, 400);

/* Monitor */
P.monitor = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="56" y="92" width="288" height="196" rx="12" fill="${NAVY}"/>
  <rect x="74" y="110" width="252" height="160" rx="6" fill="${DARK}"/>
  <g fill="${CYAN}" opacity=".85">
    <rect x="92" y="128" width="104" height="62" rx="4"/><rect x="208" y="128" width="100" height="62" rx="4"/>
    <rect x="92" y="202" width="104" height="50" rx="4"/><rect x="208" y="202" width="100" height="50" rx="4"/>
  </g>
  <rect x="176" y="288" width="48" height="36" fill="${SLATE}"/>
  <rect x="132" y="322" width="136" height="16" rx="7" fill="${GREY}"/>
`, 400, 400);

/* UPS */
P.ups = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="92" y="96" width="216" height="208" rx="14" fill="${NAVY}"/>
  <rect x="112" y="118" width="120" height="70" rx="8" fill="${DARK}"/>
  <path d="M124 160h20l12-26 16 44 12-18h28" fill="none" stroke="${CYAN}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="${SLATE}"><rect x="248" y="124" width="34" height="26" rx="5"/><rect x="248" y="160" width="34" height="26" rx="5"/></g>
  <g fill="${GREY}"><circle cx="140" cy="230" r="14"/><circle cx="190" cy="230" r="14"/><circle cx="240" cy="230" r="14"/><circle cx="272" cy="230" r="14"/></g>
  <rect x="120" y="264" width="160" height="22" rx="8" fill="${CYAN}" opacity=".85"/>
`, 400, 400);

/* Coaxial cable reel */
P.coax = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <circle cx="200" cy="200" r="112" fill="${NAVY}"/>
  <circle cx="200" cy="200" r="72" fill="${DARK}"/>
  <circle cx="200" cy="200" r="34" fill="${BG}"/>
  <g fill="${CYAN}"><circle cx="200" cy="200" r="7"/></g>
  <g stroke="${GREY}" stroke-width="8" stroke-linecap="round" fill="none">
    <path d="M104 140c-40 34-40 86 0 120"/>
    <path d="M296 140c40 34 40 86 0 120"/>
  </g>
  <g fill="${NAVY}"><rect x="300" y="150" width="34" height="26" rx="6"/><rect x="300" y="224" width="34" height="26" rx="6"/></g>
`, 400, 400);

/* Power cable spool */
P.powercable = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <circle cx="200" cy="200" r="104" fill="${NAVY}"/>
  <circle cx="200" cy="200" r="58" fill="${DARK}"/>
  <circle cx="200" cy="200" r="20" fill="${BG}"/>
  <path d="M296 200c40 0 44 40 80 40" fill="none" stroke="${CYAN}" stroke-width="9" stroke-linecap="round"/>
  <path d="M104 200c-40 0-44 40-80 40" fill="none" stroke="${GREY}" stroke-width="9" stroke-linecap="round"/>
  <g fill="${DARK}"><rect x="364" y="230" width="24" height="34" rx="6"/><rect x="12" y="230" width="24" height="34" rx="6"/></g>
`, 400, 400);

/* BNC connectors */
P.bnc = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <g>
    <rect x="52" y="150" width="120" height="56" rx="10" fill="${NAVY}"/>
    <circle cx="196" cy="178" r="36" fill="${DARK}"/>
    <circle cx="196" cy="178" r="18" fill="${BG}"/>
    <circle cx="196" cy="178" r="7" fill="${CYAN}"/>
    <rect x="230" y="158" width="40" height="40" rx="6" fill="${SLATE}"/>
    <path d="M270 178h86" stroke="${GREY}" stroke-width="10" stroke-linecap="round"/>
  </g>
  <g>
    <rect x="52" y="250" width="120" height="56" rx="10" fill="${NAVY}"/>
    <circle cx="196" cy="278" r="36" fill="${DARK}"/>
    <circle cx="196" cy="278" r="18" fill="${BG}"/>
    <circle cx="196" cy="278" r="7" fill="${CYAN}"/>
    <rect x="230" y="258" width="40" height="40" rx="6" fill="${SLATE}"/>
    <path d="M270 278h86" stroke="${GREY}" stroke-width="10" stroke-linecap="round"/>
  </g>
`, 400, 400);

/* PIR motion sensor */
P.pir = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="130" y="110" width="140" height="190" rx="20" fill="${NAVY}"/>
  <rect x="152" y="134" width="96" height="96" rx="12" fill="${DARK}"/>
  <path d="M176 182a24 24 0 0 1 48 0" fill="none" stroke="${CYAN}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="200" cy="182" r="8" fill="${CYAN}"/>
  <g fill="${GREY}"><circle cx="164" cy="252" r="6"/><circle cx="200" cy="252" r="6"/><circle cx="236" cy="252" r="6"/></g>
  <rect x="158" y="270" width="84" height="16" rx="6" fill="${SLATE}"/>
`, 400, 400);

/* RFID card + tag */
P.rfid = () => svg(`
  <rect width="400" height="400" fill="${BG}"/>
  <rect x="58" y="130" width="180" height="120" rx="12" fill="${NAVY}"/>
  <rect x="74" y="148" width="48" height="48" rx="6" fill="${CYAN}" opacity=".9"/>
  <g fill="${GREY}"><rect x="136" y="150" width="84" height="10" rx="5"/><rect x="136" y="170" width="60" height="10" rx="5"/>
  <rect x="136" y="190" width="72" height="10" rx="5"/></g>
  <path d="M238 190h34a26 26 0 0 1 0 52h-34" fill="none" stroke="${GREY}" stroke-width="10" stroke-linecap="round"/>
  <rect x="256" y="284" width="80" height="52" rx="10" fill="${DARK}"/>
  <circle cx="296" cy="310" r="13" fill="${CYAN}" opacity=".9"/>
`, 400, 400);

/* ───────────────────────── brand wordmarks ───────────────────────── */
const BRANDS = {
  hikvision: { label: 'HIKVISION', color: '#D32029', glyph: 'cam' },
  dahua:     { label: 'DAHUA',     color: '#B31217', glyph: 'lens' },
  uniview:   { label: 'UNIVIEW',   color: '#0B5FA5', glyph: 'cube' },
  tiandy:    { label: 'TIANDY',    color: '#E4572E', glyph: 'cam' },
  vivotek:   { label: 'VIVOTEK',   color: '#0072BC', glyph: 'lens' },
  feritac:   { label: 'FERITAC',   color: '#1F7A54', glyph: 'shield' },
  axis:      { label: 'AXIS',      color: '#00507A', glyph: 'cube' },
  hanwha:    { label: 'HANWHA',    color: '#C8102E', glyph: 'lens' },
  zyxel:     { label: 'ZYXEL',     color: '#E4002B', glyph: 'grid' },
  ubiquiti:  { label: 'UBIQUITI',  color: '#0559C9', glyph: 'grid' },
  seagate:   { label: 'SEAGATE',   color: '#6EBE44', glyph: 'disc' },
  wd:        { label: 'WESTERN DIGITAL', color: '#1A4E8A', glyph: 'disc' },
  'tp-link': { label: 'TP-LINK',   color: '#00A9CE', glyph: 'grid' },
  sepco:     { label: 'SEPCO',     color: '#1F7A54', glyph: 'shield' },
};
function glyph(kind, color) {
  switch (kind) {
    case 'cam': return `<path d="M6 14h20a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z" fill="none" stroke="${color}" stroke-width="2.4"/><path d="M29 19l9-4v14l-9-4z" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="14" cy="22" r="5" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    case 'lens': return `<circle cx="18" cy="22" r="13" fill="none" stroke="${color}" stroke-width="2.4"/><circle cx="18" cy="22" r="5" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    case 'cube': return `<path d="M18 7l12 6v12l-12 6-12-6V13z" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/><path d="M6 13l12 6 12-6M18 19v12" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
    case 'shield': return `<path d="M18 6l12 4v11c0 7-5 11-12 13-7-2-12-6-12-13V10z" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
    case 'grid': return `<rect x="6" y="12" width="10" height="8" rx="2" fill="none" stroke="${color}" stroke-width="2.2"/><rect x="20" y="12" width="10" height="8" rx="2" fill="none" stroke="${color}" stroke-width="2.2"/><rect x="6" y="24" width="10" height="8" rx="2" fill="none" stroke="${color}" stroke-width="2.2"/><rect x="20" y="24" width="10" height="8" rx="2" fill="none" stroke="${color}" stroke-width="2.2"/>`;
    case 'disc': return `<circle cx="18" cy="22" r="13" fill="none" stroke="${color}" stroke-width="2.4"/><circle cx="18" cy="22" r="3.5" fill="${color}"/>`;
    default: return '';
  }
}
function brandSvg(b) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 44" width="220" height="44" role="img">` +
    `<rect x="0" y="0" width="44" height="44" rx="9" fill="${b.color}"/>` +
    glyph(b.glyph, '#FFFFFF') +
    `<text x="54" y="29" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="19" font-weight="700" ` +
    `fill="${b.color}" textLength="156" lengthAdjust="spacingAndGlyphs">${b.label}</text></svg>`;
}

/* ───────────────────────── category icons ───────────────────────── */
function catSvg(inner, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img">` +
    `<rect width="64" height="64" rx="14" fill="${color}" opacity=".10"/>` + inner + `</svg>`;
}
const S = (d, c) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
const CATS = {
  'cctv-cameras': { color: NAVY, body: S('M6 18l26-8 4 9-26 8z', NAVY) + S('M36 20l10-3v13l-10-3', NAVY) + S('M16 27v10', NAVY) + S('M10 44h18', NAVY) },
  'dvr-nvr': { color: '#15618C', body: `<rect x="8" y="14" width="48" height="28" rx="4" fill="none" stroke="#15618C" stroke-width="2.6"/><circle cx="22" cy="28" r="6" fill="none" stroke="#15618C" stroke-width="2.6"/>` + S('M38 22h12M38 30h12M20 46h24', '#15618C') },
  'security-systems': { color: '#2E7D32', body: S('M32 8l20 8v16c0 12-9 19-20 24-11-5-20-12-20-24V16z', '#2E7D32') + S('M24 32l6 6 12-13', '#2E7D32') },
  'lenses-imaging': { color: '#ED6C02', body: `<circle cx="32" cy="32" r="21" fill="none" stroke="#ED6C02" stroke-width="2.6"/><circle cx="32" cy="32" r="9" fill="none" stroke="#ED6C02" stroke-width="2.6"/>` + S('M32 4v8M32 52v8M4 32h8M52 32h8', '#ED6C02') },
  'network-equipment': { color: '#4527A0', body: `<circle cx="32" cy="14" r="6" fill="none" stroke="#4527A0" stroke-width="2.6"/><circle cx="14" cy="48" r="6" fill="none" stroke="#4527A0" stroke-width="2.6"/><circle cx="50" cy="48" r="6" fill="none" stroke="#4527A0" stroke-width="2.6"/>` + S('M32 20L16 42M32 20l16 22M20 48h24', '#4527A0') },
  'camera-accessories': { color: '#00838F', body: S('M32 12l20 11v18L32 52 12 41V23z', '#00838F') + S('M12 23l20 11 20-11M32 34v18', '#00838F') },
  'safety-security': { color: '#F4511E', body: S('M32 8l20 8v16c0 12-9 19-20 24-11-5-20-12-20-24V16z', '#F4511E') },
  'rack-cabinet': { color: '#6D4C41', body: `<rect x="14" y="8" width="36" height="48" rx="3" fill="none" stroke="#6D4C41" stroke-width="2.6"/>` + S('M14 22h36M14 36h36M22 15h2M22 29h2M22 43h2', '#6D4C41') },
  'installation-tools': { color: '#546E7A', body: S('M44 10a11 11 0 0 0-11 11L14 40l8 8 19-19a11 11 0 0 0 11-11l-7 7-6-6z', '#546E7A') },
  'storage-monitoring': { color: '#455A64', body: `<rect x="8" y="18" width="48" height="28" rx="4" fill="none" stroke="#455A64" stroke-width="2.6"/>` + S('M18 18v28M28 18v28M38 18v28M48 18v28M14 32h4', '#455A64') },
  'cables-wiring': { color: '#0277BD', body: S('M12 22h10a6 6 0 0 1 6 6v8a6 6 0 0 0 6 6h10', '#0277BD') + S('M42 18l10 10-10 10', '#0277BD') },
  'specialized-equipment': { color: '#2E7D32', body: S('M32 10c8 0 12 6 12 12 0 4-2 7-5 9v13a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V31c-3-2-5-5-5-9 0-6 4-12 12-12z', '#2E7D32') + S('M27 44h10', '#2E7D32') },
};

/* ───────────────────────── product image map ───────────────────────── */
const HIK = '#D32029', DAH = '#B31217', UNV = '#0B5FA5', TIA = '#E4572E',
  VIV = '#0072BC', FER = '#1F7A54', ZYX = '#E4002B', UBI = '#0559C9',
  SEA = '#6EBE44', WD = '#1A4E8A', TPL = '#00A9CE', SPC = '#1F7A54';

const PRODUCT_IMAGES = {
  'hikvision-ds-2cd2t47wd-l3': P.bullet(HIK),
  'hikvision-ds-2cd2143g2-i': P.dome(HIK),
  'dahua-hdw3441r3': P.turret(DAH),
  'uniview-ipc2124sr3-ud': P.bullet(UNV),
  'tiandy-tc-s32di': P.ptz(TIA),
  'hikvision-ds-7608ni-k2-8': P.recorder(HIK, 'NVR 8CH'),
  'dahua-nvr4216-4k': P.recorder(DAH, 'NVR 16CH'),
  'tiandy-td-5108k1': P.recorder(TIA, 'DVR 8CH'),
  'uniview-nvr308-32x': P.recorder(UNV, 'NVR 32CH'),
  'feritac-wireless-alarm-kit': P.alarm(FER),
  'feritac-access-control-500': P.access(FER),
  'feritac-speed-gate-2-lane': P.turnstile(),
  'feritac-addressable-fire-alarm': P.firealarm('#D32F2F'),
  'feritac-motorized-lens-4-12mm': P.lens(FER),
  'feritac-fixed-lens-4mm': P.lens('#607D8B'),
  'feritac-dome-camera-housing': P.housing(),
  'zyxel-gs1200-8-poe': P.switch(ZYX),
  'ubiquiti-usw-flex-8-poe': P.switch(UBI),
  'ubiquiti-ubr-ir': P.repeater(UBI),
  'tp-link-cat6-305m': P.cablebox(),
  'feritac-camera-mount-bracket': P.bracket(),
  'feritac-camera-power-adapter-12v2a': P.adapter(),
  'sepco-safety-helmet': P.helmet(),
  'sepco-insulated-gloves': P.gloves(),
  'feritac-wall-rack-9u': P.rack(),
  'feritac-floor-cabinet-75cm': P.cabinet(),
  'feritac-cctv-test-probe': P.probe(),
  'feritac-network-cable-tester': P.tester(),
  'wd-purple-4tb': P.hdd(WD),
  'seagate-skyhawk-6tb': P.hdd(SEA),
  'generic-security-monitor-22': P.monitor(),
  'feritac-ups-600va': P.ups(),
  'tp-link-coaxial-rg59-bnc-100m': P.coax(),
  'tp-link-camera-power-cable-2x1': P.powercable(),
  'tp-link-bnc-connector-10': P.bnc(),
  'feritac-pir-motion-sensor': P.pir(),
  'feritac-rfid-card-tag': P.rfid(),
};

/* ───────────────────────── write ───────────────────────── */
function write(dir, name, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
}

const brandDir = path.join(IMG, 'brands');
for (const [k, b] of Object.entries(BRANDS)) write(brandDir, k + '.svg', brandSvg(b));

const catDir = path.join(IMG, 'categories');
for (const [k, c] of Object.entries(CATS)) write(catDir, k + '.svg', catSvg(c.body, c.color));

const prodDir = path.join(IMG, 'products');
for (const [k, v] of Object.entries(PRODUCT_IMAGES)) write(prodDir, k + '.svg', v);

console.log('brands:', Object.keys(BRANDS).length,
  '| categories:', Object.keys(CATS).length,
  '| products:', Object.keys(PRODUCT_IMAGES).length);
