export type BackgroundPreset = { id: string; labelAr: string; labelEn: string; svg: string };

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "river-mountains",
    labelAr: "جبال وأنهار",
    labelEn: "Mountains & rivers",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900">
      <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#06172b"/><stop offset=".58" stop-color="#174464"/><stop offset="1" stop-color="#081723"/></linearGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="#93dff0"/><stop offset="1" stop-color="#102c43"/></linearGradient><radialGradient id="moon"><stop stop-color="#fff8db"/><stop offset="1" stop-color="#d8eaff" stop-opacity="0"/></radialGradient></defs>
      <rect width="1400" height="900" fill="url(#sky)"/><circle cx="1060" cy="170" r="135" fill="url(#moon)"/><circle cx="1060" cy="170" r="48" fill="#e3eff4" opacity=".94"/>
      <path d="M0 520 190 300 315 430 470 245 650 480 815 285 1005 480 1160 260 1400 500V900H0Z" fill="#18344a"/><path d="M0 600 220 375 350 520 510 330 715 590 900 355 1070 535 1225 360 1400 565V900H0Z" fill="#0d2738"/><path d="m420 315 90-115 90 140-70-37-29 26-34-23Z M760 392l140-180 120 190-98-56-41 39-43-28Z" fill="#cadbe0" opacity=".72"/>
      <path d="M0 660q180-65 340 10t330-8 340 15 390-12V900H0Z" fill="#081c2a"/><path d="M600 900q90-105 220-160t190-100q-90 90-65 145t-110 115Z" fill="url(#water)" opacity=".9"/><path d="M760 900q55-105 170-160" fill="none" stroke="#d7f6fa" stroke-width="12" opacity=".48"/>
      <g fill="#020b11"><path d="M75 790q70-105 133-35l42 55-36 20-29-37-24 63H93l20-55-40 12Z"/><path d="M190 785l-25-55 15-35 20 22 3 34 28 30-5 15-25-10-6 44h-20Z"/><path d="M265 810q52-76 101-35l39 33-20 18-32-22-17 47h-37l12-40-40 11Z"/><path d="M310 780l-10-58 19-28 16 22-2 31 25 27-7 14-24-7-1 41h-18Z"/></g>
      <path d="M116 740V555l112 52-112-12" fill="#05080c"/><path d="M117 565 199 602 117 593" fill="#e4e8e8" opacity=".7"/><path d="M300 766V600l-92 46 92-8" fill="#e8e8e6" opacity=".86"/><path d="M0 855q220-65 400 10t400 0 600-6v41H0Z" fill="#03090e"/>
      <g fill="#d7e8ee" opacity=".65"><circle cx="160" cy="110" r="3"/><circle cx="300" cy="175" r="2"/><circle cx="520" cy="85" r="2"/><circle cx="720" cy="165" r="3"/><circle cx="880" cy="85" r="2"/><circle cx="1280" cy="320" r="2"/></g>
    </svg>`,
  },
  {
    id: "arabian-horses",
    labelAr: "خيول عربية أصيلة",
    labelEn: "Arabian horses",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900">
      <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#10172a"/><stop offset=".55" stop-color="#735c61"/><stop offset="1" stop-color="#e3a875"/></linearGradient><linearGradient id="sand" x2="0" y2="1"><stop stop-color="#b77d5a"/><stop offset="1" stop-color="#171d29"/></linearGradient></defs>
      <rect width="1400" height="900" fill="url(#sky)"/><circle cx="1030" cy="210" r="78" fill="#ffe4b8" opacity=".92"/><path d="M0 535 180 450 370 500 580 400 810 505 1000 425 1210 495 1400 420V900H0Z" fill="#42384a"/><path d="M0 650q190-140 390-28t370-15 350-35 290 5V900H0Z" fill="url(#sand)"/><path d="M0 760q170-60 330-5t360 5 340-35 370 30V900H0Z" fill="#151a21"/>
      <path d="M120 785q18-72 75-70l33 24 25 49-16 10-28-34-8 55h-17l2-64-20 6-13 58h-18l6-63-21 41-16-2Z" fill="#070b10"/><path d="M195 722l-3-52 20-23 22 10 5 20-16 10 5 25 26 25-7 12-23-13-8 41h-17l4-40Z" fill="#070b10"/><path d="M430 812q15-84 80-85l34 20 35 61-19 13-34-40-6 67h-22l1-76-22 10-12 66h-20l8-71-20 41-17-1Z" fill="#02070b"/><path d="M506 730l-6-58 25-29 22 16 7 20-19 9 8 30 26 28-8 15-28-15-7 48h-20l3-43Z" fill="#02070b"/><path d="M645 805q18-62 70-58l33 28 22 42-17 12-25-31-10 54h-18l5-59-20 2-14 58h-20l11-59-20 27-16-2Z" fill="#070b10"/><path d="M713 755l-4-48 21-23 18 12 5 21-15 8 6 21 22 23-7 11-23-12-8 34h-17l4-36Z" fill="#070b10"/>
      <path d="M820 570V410l92 44-92-8" fill="#07090d"/><path d="M822 425 891 458 822 450" fill="#c6d0d6"/><path d="M950 610V460l-80 36 80-8" fill="#e8e7df" opacity=".92"/><path d="M952 475 890 502 952 495" fill="#35383c"/>
      <path d="M0 867q240-65 465-5t440 0 495 0v38H0Z" fill="#070b10"/><g fill="#ffead0" opacity=".5"><circle cx="180" cy="155" r="3"/><circle cx="440" cy="215" r="2"/><circle cx="655" cy="110" r="2"/><circle cx="1230" cy="360" r="3"/></g>
    </svg>`,
  },
  {
    id: "night-riders",
    labelAr: "فرسان الليل",
    labelEn: "Riders at night",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900">
      <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#020916"/><stop offset=".55" stop-color="#112d3d"/><stop offset="1" stop-color="#07131e"/></linearGradient><linearGradient id="river" x2="0" y2="1"><stop stop-color="#6fc7d8"/><stop offset="1" stop-color="#123d51"/></linearGradient></defs>
      <rect width="1400" height="900" fill="url(#sky)"/><circle cx="1120" cy="150" r="58" fill="#dcebf0"/><path d="M0 470 180 280 350 450 530 240 760 465 940 290 1120 430 1280 235 1400 400V900H0Z" fill="#142b3d"/><path d="M0 610 240 430 410 560 610 380 810 590 1020 400 1210 555 1400 420V900H0Z" fill="#091b29"/><path d="M0 700q160-55 310 0t310 0 310 0 470 0v200H0Z" fill="#030a12"/><path d="M600 900q150-120 245-175t210-40q-150 90-85 135t-80 80Z" fill="url(#river)"/><path d="M760 900q65-88 168-130" stroke="#c4f2f5" stroke-width="8" opacity=".6" fill="none"/>
      <g fill="#020509"><path d="M220 780q35-84 95-62l34 26 28 42-17 13-31-30-6 54h-20l3-59-19 8-13 51h-18l8-54-20 29-17-3Z"/><path d="M300 727l-3-56 19-24 22 13 6 20-16 10 6 26 24 28-8 13-24-12-7 38h-19l4-39Z"/><path d="M400 800q35-75 90-55l30 24 30 43-18 12-30-31-7 53h-18l4-58-20 7-12 50h-18l8-51-18 28-18-3Z"/><path d="M480 744l-4-53 20-25 21 13 5 20-15 9 5 25 23 26-8 13-23-12-8 37h-18l3-38Z"/></g>
      <path d="M270 722V535l105 52-105-12" fill="#030609"/><path d="M271 547 346 584 271 575" fill="#cfdce1" opacity=".7"/><path d="M440 743V555l-100 51 100-11" fill="#e4e8e7"/><path d="M441 567 367 605 441 596" fill="#4f5e67"/>
      <g fill="#d4eff4" opacity=".75"><circle cx="125" cy="128" r="2"/><circle cx="340" cy="170" r="3"/><circle cx="610" cy="120" r="2"/><circle cx="800" cy="185" r="2"/><circle cx="1290" cy="275" r="2"/></g>
    </svg>`,
  },
];
