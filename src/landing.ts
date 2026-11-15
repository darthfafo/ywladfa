/**
 * La portada web: qué es el juego, quiénes lo hicimos y con qué fuentes, con un
 * botón grande de JUGAR AHORA que abre el lanzador (BootScene). Es HTML aparte,
 * por encima del canvas: el juego carga detrás mientras se lee. De fondo pasan
 * escenas de los niveles ya hechos, con un sombreado que deja leer.
 *
 * No aparece con los atajos de desarrollo (`?nivel=`, `?marcha`) ni con `?jugar`.
 */

const shots = import.meta.glob('./assets/landing/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const img = (name: string): string => shots[`./assets/landing/${name}.jpg`] ?? '';

/** Lo que pasa de fondo: escenas del juego y sus ilustraciones, nivel por nivel. */
const SLIDES: Array<{ img: string; label: string }> = [
  { img: 'il_cold_open', label: 'Nivel 1 · Las cuevas' },
  { img: 'n1_fogon', label: 'Nivel 1 · El fogón de la segunda noche' },
  { img: 'il_manantial', label: 'Nivel 1 · El manantial' },
  { img: 'il_marcha_partida', label: 'Nivel 2 · La travesía' },
  { img: 'n2_marcha', label: 'Nivel 2 · La columna, rumbo al sur' },
  { img: 'il_marcha_noche', label: 'Nivel 2 · Noche a la intemperie' },
  { img: 'il_marcha_toldos', label: 'Nivel 2 · Toldos a lo lejos' },
  { img: 'il_marcha_caer_antur', label: 'Nivel 2 · Caer Antur' },
  { img: 'n3_campamento', label: 'Nivel 3 · El valle, junto al fuerte viejo' },
  { img: 'n3_toldo', label: 'Nivel 3 · El toldo, al pie de la barda' },
];

const LEVELS = [
  {
    n: 1,
    title: 'Las cuevas',
    when: 'Punta Cuevas, julio de 1865',
    img: 'il_subida_barranca',
    text: 'Desembarcás del Mimosa con la colonia. Bajar la carga antes de la marea, elegir cueva, encontrar agua. Y decidir qué se lleva y qué se deja en la playa.',
  },
  {
    n: 2,
    title: 'La travesía',
    when: 'Del golfo al río, agosto de 1865',
    img: 'il_marcha_rio',
    text: 'Sesenta y cinco kilómetros a pie por la estepa. Vos marcás el paso: apurar gasta agua y cansa a tu madre; esperar no acerca.',
  },
  {
    n: 3,
    title: 'El valle',
    when: 'Trerawson, 1865 – 1868',
    img: 'n3_campamento',
    text: 'Una bandera que no es la tuya, una crecida, el primer invierno y el trato sobre la manta. Y una zanja cavada a mano que lo cambia todo.',
  },
];

const PILLARS = [
  { t: 'Sin combate', d: 'Se sobrevive cuidando a los tuyos, no venciendo a nadie.' },
  { t: 'Todo se decide', d: 'Lo que dejás en la playa te falta tres niveles después. Nada es de adorno.' },
  { t: 'Entender es un recurso', d: 'Galés, castellano y aonikenk. Lo que no entendés, lo ves en bloques: ▓▓▓.' },
  { t: 'Historia real', d: 'El Códice separa lo documentado de lo que el juego inventa.' },
];

const SOURCES = [
  '«De galeses y tehuelche. El pacto fundacional de la historia oficial chubutense» (Dumrauf, Matthews, Musters, Coronato)',
  'SciELO Argentina, «Amigos, pero intrusos: los caciquillos del Chupat y sus negociaciones con el gobierno y la colonia galesa (1865-1883)»',
  'CONICET, «La colonización galesa del Chubut y la necesidad de un puerto»',
  'MercoPress, «Welsh community mark 140 years in Patagonia» (2005)',
  'Asociación Galesa de Puerto Madryn, sección Historia',
  'Wikipedia: «Y Wladfa», «Colonización galesa en Argentina», «Rifleros del Chubut»',
  'Infobae: «A 155 años de la llegada de los primeros galeses a la Patagonia» (2020) y «Galeses en la Patagonia» (2022)',
];

export function showLanding(): void {
  const q = new URLSearchParams(location.search);
  if (q.has('nivel') || q.has('marcha') || q.has('jugar')) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'landing';
  root.innerHTML = `
    <div class="ld-bg">${SLIDES.map((s, i) => `<div class="ld-slide${i === 0 ? ' on' : ''}" style="background-image:url('${img(s.img)}')"></div>`).join('')}</div>
    <div class="ld-shade"></div>
    <div class="ld-caption"><span></span></div>
    <main class="ld-scroll">
      <section class="ld-hero">
        <p class="ld-kicker">Un juego con rigor histórico · Patagonia, 1865</p>
        <h1>Chubut 1865</h1>
        <p class="ld-sub">La Huella de los Rifleros</p>
        <p class="ld-lead">Un juego de supervivencia sin combate sobre la colonia galesa del Chubut. Bajás del Mimosa con ciento cincuenta colonos, cruzás la estepa a pie y levantás un pueblo a orillas de un río que no conocés. Cada decisión pesa: qué cargar, a quién escuchar, con quién compartir el pan.</p>
        <button class="ld-play" type="button">Jugar ahora</button>
        <p class="ld-note">Gratis · en el navegador · pensado para el celular</p>
      </section>

      <section>
        <h2>Qué es</h2>
        <div class="ld-pillars">${PILLARS.map((p) => `<div class="ld-card"><h3>${p.t}</h3><p>${p.d}</p></div>`).join('')}</div>
      </section>

      <section>
        <h2>Los niveles</h2>
        <div class="ld-levels">${LEVELS.map(
          (l) => `<article class="ld-level">
            <div class="ld-thumb" style="background-image:url('${img(l.img)}')"><span>Nivel ${l.n}</span></div>
            <div><h3>${l.title}</h3><p class="ld-when">${l.when}</p><p>${l.text}</p></div>
          </article>`,
        ).join('')}</div>
        <p class="ld-more">Continuará: el riego, los Rifleros, el valle 16 de Octubre.</p>
      </section>

      <section>
        <h2>Fuentes</h2>
        <ul class="ld-sources">${SOURCES.map((s) => `<li>${s}</li>`).join('')}</ul>
        <p class="ld-fine">Las fuentes primarias (la crónica de Abraham Matthews, los registros de Richard Jones Berwyn) están pendientes de revisión. Lo que el juego dramatiza (diálogos, personajes ficticios, el orden de algunos hechos) está marcado en cada ficha del Códice.</p>
      </section>

      <section class="ld-credits">
        <h2>Quiénes lo hicimos</h2>
        <p>Desarrollado por <strong>Fede Puratich</strong>, con <strong>Claude</strong> (Anthropic).</p>
        <button class="ld-play ld-play-sm" type="button">Jugar ahora</button>
      </section>
    </main>`;
  document.body.appendChild(root);

  // de fondo, las escenas: una cada tanto, con un fundido largo
  const slides = [...root.querySelectorAll<HTMLElement>('.ld-slide')];
  const caption = root.querySelector<HTMLElement>('.ld-caption span')!;
  let i = 0;
  caption.textContent = SLIDES[0]!.label;
  const timer = window.setInterval(() => {
    slides[i]!.classList.remove('on');
    i = (i + 1) % slides.length;
    slides[i]!.classList.add('on');
    caption.textContent = SLIDES[i]!.label;
  }, 5500);

  // la etiqueta de la escena de fondo, solo arriba: al bajar a leer, no tapa el texto
  const scroller = root.querySelector<HTMLElement>('.ld-scroll')!;
  scroller.addEventListener('scroll', () => root.classList.toggle('scrolled', scroller.scrollTop > 120), { passive: true });

  // JUGAR AHORA: la portada se va y queda el lanzador (BootScene), que cargó detrás
  const play = (): void => {
    window.clearInterval(timer);
    root.classList.add('out');
    window.setTimeout(() => root.remove(), 600);
  };
  root.querySelectorAll('.ld-play').forEach((b) => b.addEventListener('click', play));
}

const CSS = `
#landing { position: fixed; inset: 0; z-index: 50; color: #EAE8E0; background: #0E1416; transition: opacity .6s ease; }
#landing.out { opacity: 0; pointer-events: none; }
#landing .ld-bg, #landing .ld-shade { position: absolute; inset: 0; }
#landing .ld-slide { position: absolute; inset: -4%; background-size: cover; background-position: center; opacity: 0;
  transition: opacity 1.8s ease; transform: scale(1.04); image-rendering: auto; }
#landing .ld-slide.on { opacity: 1; animation: ld-zoom 9s ease-out forwards; }
@keyframes ld-zoom { from { transform: scale(1.04); } to { transform: scale(1.12); } }
#landing .ld-shade { background:
  linear-gradient(to bottom, rgba(14,20,22,.30) 0%, rgba(14,20,22,.62) 40%, rgba(14,20,22,.9) 100%),
  radial-gradient(ellipse at 50% 40%, rgba(14,20,22,.35) 0%, rgba(14,20,22,.55) 100%); }
#landing .ld-caption { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; pointer-events: none; z-index: 2; transition: opacity .4s ease; }
#landing.scrolled .ld-caption { opacity: 0; }
#landing .ld-caption span { font: 9px 'Press Start 2P', ui-monospace, monospace; color: #BFD3D8; opacity: .8;
  background: rgba(14,20,22,.6); padding: 6px 10px; border: 1px solid rgba(217,168,69,.25); }
#landing .ld-scroll { position: relative; z-index: 1; height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 0 16px 64px; box-sizing: border-box; }
#landing section { max-width: 620px; margin: 0 auto; padding: 28px 0; }
#landing .ld-hero { min-height: 92dvh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding-top: 48px; }
#landing .ld-kicker { font: 9px/1.8 'Press Start 2P', ui-monospace, monospace; color: #7FB0B8; letter-spacing: 1px; margin: 0 0 18px; }
#landing h1 { font: clamp(34px, 9vw, 64px)/1.1 'Press Start 2P', ui-monospace, monospace; color: #D9A845; margin: 0;
  text-shadow: 0 3px 0 #5C3022, 0 0 30px rgba(14,20,22,.9); }
#landing .ld-sub { font: italic clamp(20px, 5vw, 28px) 'IM Fell English', Georgia, serif; color: #EAE8E0; margin: 14px 0 22px; }
#landing .ld-lead { font: clamp(17px, 4.2vw, 20px)/1.55 'IM Fell English', Georgia, serif; color: #EAE8E0; max-width: 540px; margin: 0 0 30px;
  text-shadow: 0 1px 2px rgba(0,0,0,.6); }
#landing .ld-play { font: 16px 'Press Start 2P', ui-monospace, monospace; letter-spacing: 1px; text-transform: uppercase; color: #0E1416;
  background: linear-gradient(#E8BC5C, #C9932F); border: 0; border-bottom: 4px solid #7A4A2E; padding: 20px 34px; cursor: pointer;
  box-shadow: 0 0 0 2px #0E1416, 0 0 0 4px #D9A845, 0 10px 30px rgba(0,0,0,.5); transition: transform .12s ease, filter .12s ease; }
#landing .ld-play:hover { transform: translateY(-2px); filter: brightness(1.08); }
#landing .ld-play:active { transform: translateY(1px); border-bottom-width: 2px; }
#landing .ld-play-sm { font-size: 12px; padding: 14px 24px; margin-top: 10px; }
#landing .ld-note { font: 8px/1.8 'Press Start 2P', ui-monospace, monospace; color: #A09472; margin: 16px 0 0; }
#landing h2 { font: 12px 'Press Start 2P', ui-monospace, monospace; color: #D9A845; text-align: center; margin: 0 0 18px; letter-spacing: 1px; }
#landing h2::before, #landing h2::after { content: ''; display: inline-block; width: 28px; height: 1px; background: #D9A845; opacity: .6; vertical-align: middle; margin: 0 10px; }
#landing h3 { font: 20px 'IM Fell English', Georgia, serif; color: #EAE8E0; margin: 0 0 6px; }
#landing p, #landing li { font: 16px/1.55 'IM Fell English', Georgia, serif; color: #D8D4C8; }
#landing .ld-pillars { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
#landing .ld-card { background: rgba(24,38,42,.72); border: 1px solid rgba(217,168,69,.28); padding: 14px 16px; }
#landing .ld-card p { margin: 0; }
#landing .ld-levels { display: flex; flex-direction: column; gap: 14px; }
#landing .ld-level { display: grid; grid-template-columns: 120px 1fr; gap: 14px; background: rgba(24,38,42,.72); border: 1px solid rgba(217,168,69,.28); padding: 12px; align-items: start; }
#landing .ld-level p { margin: 0; }
#landing .ld-thumb { aspect-ratio: 3 / 4; background-size: cover; background-position: center; position: relative; border: 1px solid rgba(217,168,69,.4); }
#landing .ld-thumb span { position: absolute; left: 6px; top: 6px; font: 7px 'Press Start 2P', monospace; color: #0E1416; background: #D9A845; padding: 4px 5px; }
#landing .ld-when { font-style: italic !important; color: #7FB0B8 !important; margin-bottom: 6px !important; }
#landing .ld-more { text-align: center; color: #A09472; font-style: italic; margin-top: 16px; }
#landing .ld-sources { padding-left: 18px; margin: 0; }
#landing .ld-sources li { margin-bottom: 6px; font-size: 15px; }
#landing .ld-fine { font-size: 14px !important; color: #A09472 !important; font-style: italic; margin-top: 14px; }
#landing .ld-credits { text-align: center; padding-bottom: 40px; }
#landing strong { color: #EAE8E0; font-weight: normal; border-bottom: 1px solid rgba(217,168,69,.6); }
@media (max-width: 420px) {
  #landing .ld-level { grid-template-columns: 88px 1fr; }
  #landing .ld-play { font-size: 14px; padding: 18px 26px; }
}
`;
