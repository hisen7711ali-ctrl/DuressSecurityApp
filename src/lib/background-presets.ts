export type BackgroundPreset = { id: string; labelAr: string; labelEn: string; svg: string };

const svg = (body: string, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900"><defs>${defs}</defs>${body}</svg>`;

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "midnight-mosque",
    labelAr: "مسجد تحت سماء الليل",
    labelEn: "Midnight mosque",
    svg: svg(`
      <rect width="1400" height="900" fill="url(#sky)"/>
      <circle cx="1090" cy="170" r="92" fill="#f6e6b6" opacity=".9"/>
      <g fill="#0a1625"><path d="M0 690V505h170v185zM170 690V430h55v260zM1225 690V455h175v235z"/><path d="M205 690V570q0-215 495-215t495 215v120z"/><path d="M650 690V420h100v270z"/><path d="M610 420q90-125 180 0z"/><path d="M690 335h20v85h-20z"/><path d="M700 300l-28 38h56z"/></g>
      <g fill="#d9edf1" opacity=".8"><circle cx="130" cy="170" r="3"/><circle cx="290" cy="95" r="2"/><circle cx="510" cy="160" r="3"/><circle cx="870" cy="90" r="2"/><circle cx="1260" cy="300" r="3"/></g>
      <path d="M0 760q180-80 360 0t360 0 360 0 320 0v140H0z" fill="#07111d"/>
    `, `<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#020817"/><stop offset=".62" stop-color="#123c55"/><stop offset="1" stop-color="#07131e"/></linearGradient>`),
  },
  {
    id: "desert-sunset",
    labelAr: "صحراء وغروب",
    labelEn: "Desert sunset",
    svg: svg(`
      <rect width="1400" height="900" fill="url(#sky)"/><circle cx="1040" cy="300" r="105" fill="#ffd49a" opacity=".92"/>
      <path d="M0 610q210-210 430-30t430-15 540-20v355H0z" fill="#5b3c36"/><path d="M0 735q190-120 420-20t420-10 560-10v195H0z" fill="url(#sand)"/>
      <g fill="#120e12"><path d="M210 700q50-145 110-210 45 65 50 210z"/><path d="M305 585q10-45 42-72 32 27 42 72z"/><path d="M920 735q60-120 125-170 55 52 66 170z"/></g>
      <path d="M0 860q240-55 470 5t430 0 500-10v45H0z" fill="#0b0c12"/>
    `, `<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#17162b"/><stop offset=".55" stop-color="#a45f55"/><stop offset="1" stop-color="#efb06f"/></linearGradient><linearGradient id="sand" x2="0" y2="1"><stop stop-color="#b77950"/><stop offset="1" stop-color="#281b1b"/></linearGradient>`),
  },
  {
    id: "emerald-geometry",
    labelAr: "هندسة إسلامية داكنة",
    labelEn: "Dark Islamic geometry",
    svg: svg(`
      <rect width="1400" height="900" fill="#071421"/><g fill="none" stroke="#2c7180" stroke-width="3" opacity=".7">
      <path d="M0 450h1400M700 0v900M0 0l1400 900M1400 0L0 900"/>
      <circle cx="700" cy="450" r="330"/><circle cx="700" cy="450" r="240"/><circle cx="700" cy="450" r="120"/>
      <path d="M700 120 1025 450 700 780 375 450zM455 205l490 490M945 205 455 695"/>
    </g><circle cx="700" cy="450" r="72" fill="#0d3340" stroke="#66d2d8" stroke-width="4"/><path d="M700 400l22 32 38 10-25 27 3 40-38-15-38 15 3-40-25-27 38-10z" fill="#cfeff0" opacity=".9"/>
    `),
  },
  {
    id: "mountain-dawn",
    labelAr: "جبال الفجر",
    labelEn: "Mountain dawn",
    svg: svg(`
      <rect width="1400" height="900" fill="url(#sky)"/><circle cx="1030" cy="260" r="120" fill="#ffe6ad" opacity=".88"/>
      <path d="M0 630 220 350 370 535 560 245 790 590 1010 320 1190 520 1400 280V900H0z" fill="#26394b"/><path d="M0 690 270 470 420 620 600 390 810 650 1030 440 1210 610 1400 430V900H0z" fill="#101f2d"/>
      <path d="M0 770q200-65 390 0t390 0 360-5 260 10v125H0z" fill="#07121d"/><path d="M510 900q110-125 235-180t250-95q-130 110-60 150t-130 125z" fill="#23536a" opacity=".85"/>
    `, `<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#061225"/><stop offset=".55" stop-color="#355d72"/><stop offset="1" stop-color="#d28a6d"/></linearGradient>`),
  },
];
