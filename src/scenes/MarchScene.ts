import Phaser from 'phaser';
import balance from '@data/config/balance.json';
import trackJson from '@data/proto/marcha.json';
import { INPUT_GUARD, PAL, VIEW } from '@/config';
import { registry } from '@/core/Registry';
import { sfx } from '@/audio/Sfx';
import { MarchView3D, type MarchActor } from '@/render3d/MarchView3D';
import { MarchSystem, type MarchConfig, type MarchEvent, type MarchObstacle, type MarchTrack, type Pace } from '@/systems/MarchSystem';
import { addPanel } from '@/ui/panel';
import { preloadArt } from '@/util/assets';
import { RETRO_FONT } from '@/util/text';
import { NPC_COLORS, PC_COLORS, resolveCharacterTexture } from '@/util/textures';

/**
 * Prototipo de la marcha del Nivel 2 en vista lateral (`?marcha` en la URL).
 * Aparte del juego: no toca la partida guardada ni el estado del Nivel 1.
 *
 * Lo que se prueba: que avanzar se sienta como avanzar (vista de costado, la
 * columna caminando, el horizonte) y que la decisión de siempre —avanzar o
 * sostener— funcione con tres controles: el paso, esperar, y qué hacer ante un
 * obstáculo. La lógica es MarchSystem (con tests); esto es la pantalla.
 */

const PACES: Array<{ id: Pace; label: string }> = [
  { id: 'aflojar', label: 'Aflojar' },
  { id: 'normal', label: 'Normal' },
  { id: 'apurar', label: 'Apurar' },
];
const TURN_LABEL: Record<string, string> = { amanecer: 'AMANECER', manana: 'MAÑANA', tarde: 'TARDE', noche: 'NOCHE' };
const TURN_INDEX: Record<string, number> = { amanecer: 0, manana: 1, tarde: 2, noche: 3 };

/** La columna: quién va, en qué orden (tiles respecto de la cabeza) y algo de profundidad. */
const COLUMN: Array<{ id: string; dx: number; z: number; mari?: boolean }> = [
  { id: 'npc_lewis', dx: 2.2, z: 0.1 },
  { id: 'pc', dx: 0, z: 0.7 },
  { id: 'horse_1', dx: -2.6, z: -0.5 },
  { id: 'npc_mari', dx: -4.6, z: 0.5, mari: true },
  { id: 'npc_edwyn', dx: -6.4, z: -0.2 },
  { id: 'horse_2', dx: -8.8, z: 0.3 },
  { id: 'npc_matthews', dx: -10.6, z: -0.6 },
  { id: 'npc_berwyn', dx: -12.4, z: 0.2 },
];

export class MarchScene extends Phaser.Scene {
  private march!: MarchSystem;
  private view: MarchView3D | null = null;
  private paused = true;
  private fade!: Phaser.GameObjects.Rectangle;
  private hudEl!: HTMLDivElement;
  private trayEl!: HTMLDivElement;
  private captionEl!: HTMLDivElement;
  private cardEl!: HTMLDivElement;
  private captionTimer: Phaser.Time.TimerEvent | null = null;
  private font = RETRO_FONT.replace(/"/g, "'");

  constructor() {
    super('March');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    document.getElementById('boot-loading')?.remove();
    window.dispatchEvent(new Event('wladfa:ready-to-show'));

    this.march = new MarchSystem((balance as any).nivel02.marcha as MarchConfig, trackJson as unknown as MarchTrack);

    // la columna, con los personajes de siempre (arte real si ya existe)
    const actors: MarchActor[] = COLUMN.map((c) => {
      if (c.id.startsWith('horse')) return { id: c.id, texture: 'horse', z: c.z };
      const colors = c.id === 'pc' ? PC_COLORS.pc_f! : NPC_COLORS[c.id]!;
      const key = resolveCharacterTexture(this, c.id === 'pc' ? 'pc_f' : c.id, colors[0], colors[1], colors[2]).key;
      return { id: c.id, texture: key, z: c.z };
    });
    this.view = new MarchView3D(this, this.march.track, actors);
    const draw = () =>
      this.view?.render(this.game.loop.delta, this.march.state.pos, this.columnXs(), { inland: this.march.inland(), storm: this.march.stormHere() ? 1 : 0 });
    this.game.events.on(Phaser.Core.Events.POST_RENDER, draw);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, draw);
      this.view?.destroy();
      this.view = null;
    });

    // HUD y bandeja: las mismas placas que el juego
    addPanel(this, 0, 0, VIEW.hud.w, VIEW.hud.h, { top: PAL.ink2, bottom: PAL.void, dropShadow: 'down' }).setDepth(60);
    addPanel(this, 0, VIEW.tray.y, VIEW.tray.w, VIEW.tray.h, { top: PAL.ink2, bottom: PAL.void, trim: true, dropShadow: 'up' }).setDepth(60);
    this.fade = this.add.rectangle(0, VIEW.world.y, VIEW.world.w, VIEW.world.h, PAL.void, 0).setOrigin(0, 0).setDepth(50);

    this.hudEl = this.dom(0, 0, VIEW.width, VIEW.hud.h, 61);
    this.trayEl = this.dom(0, VIEW.tray.y, VIEW.width, VIEW.tray.h, 61);
    this.captionEl = this.dom(0, VIEW.world.y + VIEW.world.h - 70, VIEW.width, 60, 62);
    this.cardEl = this.dom(0, VIEW.world.y, VIEW.width, VIEW.world.h, 63);
    this.buildTray();
    this.refresh();

    const kb = this.input.keyboard;
    kb?.on('keydown-ONE', () => this.setPace('aflojar'));
    kb?.on('keydown-TWO', () => this.setPace('normal'));
    kb?.on('keydown-THREE', () => this.setPace('apurar'));
    kb?.on('keydown-SPACE', () => this.toggleWait());

    this.showCard(
      'La marcha',
      // sin cifras de distancia ni de días: están pendientes de decisión (docs/04 §1.1)
      'Del golfo al río, a pie, por la estepa. Vos marcás el paso de la columna.' +
        '<br><br>Apurar llega antes, pero gasta más agua y cansa a tu madre. Esperar no acerca, pero el sol sigue andando.' +
        '<br><br>Prestá atención a lo que se dice en el camino: nadie lo va a repetir.',
      [{ label: 'Salir de Punta Cuevas', onPick: () => this.hideCard() }],
    );
  }

  /** Dónde va cada uno de la columna (tiles). */
  private columnXs(): Record<string, number> {
    const s = this.march.state;
    const out: Record<string, number> = {};
    for (const c of COLUMN) out[c.id] = s.pos + c.dx - (c.mari ? s.mariLag : 0);
    return out;
  }

  override update(_t: number, delta: number): void {
    if (this.paused) return;
    const ev = this.march.update(delta / 1000);
    for (const e of ev) this.onEvent(e);
    this.refresh();
  }

  private onEvent(e: MarchEvent): void {
    switch (e.type) {
      case 'line':
        this.caption(e.speaker === 'pc' ? 'Elin' : registry.speakerName(e.speaker, 'Elin'), e.text);
        break;
      case 'turn':
        this.view?.setTurn(e.turn);
        break;
      case 'obstacle':
        this.obstacle(e.obstacle);
        break;
      case 'night':
        this.night(e.day, e.option);
        break;
      case 'mariBehind':
        this.caption('', 'Tu madre se quedó atrás. La columna para a esperarla.');
        break;
      case 'thirst':
        this.caption('Lewis Jones', 'Se terminó el agua. Despacio, y nadie se separa.');
        break;
      case 'arrived':
        this.arrived();
        break;
      case 'skip':
        break;
    }
  }

  // ---------------------------------------------------------------- momentos

  /** Qué se cuenta mientras pasa el tiempo de un rodeo, un extravío o un refugio. */
  private skipText(o: MarchObstacle, kind: 'detour' | 'lost' | 'shelter'): string {
    if (kind === 'lost') return 'La huella se borra entre las matas. Caminan, dan vueltas, vuelven sobre sus pasos. El sol ya está más bajo.';
    if (kind === 'shelter') return 'Se tiran al suelo en un bajo, con la cara tapada. Horas después el viento afloja.';
    if (o.type === 'canadon') return 'Media legua de rodeo por el borde del cañadón.';
    if (o.type === 'aguada') return 'Bajo las matas hay un hilo de agua. Se llenan los barriles.';
    if (o.type === 'fork') return 'La huella de la costa da vueltas por la barranca, pero el mar está siempre ahí.';
    return 'Pasa el tiempo.';
  }

  private obstacle(o: MarchObstacle): void {
    // la noche muestra con qué se cuenta: es lo que hay que repartir
    const s = this.march.state;
    const prompt =
      o.type === 'night'
        ? `${o.prompt ?? ''}<br><br><span style="color:#7FB0B8">Quedan ${Math.round(s.agua)} L de agua y ${Math.round(s.comida)} raciones.</span>`
        : (o.prompt ?? '');
    this.showCard(
      o.title ?? '',
      prompt,
      (o.options ?? []).map((opt) => ({
        label: opt.text,
        detail: opt.detail,
        onPick: () => {
          this.hideCard();
          const ev = this.march.choose(opt.id);
          const skip = ev.find((x) => x.type === 'skip') as Extract<MarchEvent, { type: 'skip' }> | undefined;
          const rest = ev.filter((x) => x.type !== 'skip');
          const after = (): void => {
            rest.forEach((x) => this.onEvent(x));
            if (skip?.kind === 'lost') this.caption('Lewis Jones', 'Ahí está el mar. Íbamos para cualquier lado. El cerro era a la derecha.', 4500);
          };
          if (skip) this.fadeThrough(this.skipText(o, skip.kind), after);
          else after();
        },
      })),
    );
  }

  private night(day: number, option: { id: string }): void {
    this.paused = true;
    this.tweens.add({
      targets: this.fade,
      fillAlpha: 1,
      duration: 900,
      onComplete: () => {
        this.caption(
          '',
          option.id === 'racionar'
            ? `Noche ${day} a la intemperie. Medio litro y media ración. Tu madre tirita hasta el amanecer.`
            : `Noche ${day} a la intemperie. El fuego dura poco, pero alcanza. Tu madre duerme.`,
          4200,
        );
        this.time.delayedCall(3600, () => {
          this.view?.setTurn(this.march.state.turn);
          this.tweens.add({ targets: this.fade, fillAlpha: 0, duration: 1100, onComplete: () => (this.paused = false) });
        });
      },
    });
  }

  private fadeThrough(text: string, after: () => void): void {
    this.paused = true;
    this.tweens.add({
      targets: this.fade,
      fillAlpha: 1,
      duration: 600,
      onComplete: () => {
        this.caption('', text, 2600);
        this.time.delayedCall(1800, () => {
          after();
          this.tweens.add({ targets: this.fade, fillAlpha: 0, duration: 700, onComplete: () => (this.paused = false) });
        });
      },
    });
  }

  private arrived(): void {
    const s = this.march.state;
    this.paused = true;
    const mari = s.mariHealth >= 60 ? 'cansada, pero entera' : s.mariHealth >= 40 ? 'débil' : 'muy débil';
    // cuántas veces se eligió el camino largo (rodeo o desvío a una aguada)
    const detours = this.march.track.obstacles.filter((o) => o.options?.find((x) => x.id === s.resolved[o.id])?.extraTiles).length;
    this.time.delayedCall(1200, () =>
      this.showCard(
        'El río',
        `Agua que corre, y sauces. Jornada ${s.day}, ${TURN_LABEL[s.turn]!.toLowerCase()}.` +
          `<br><br>Agua: ${Math.round(s.agua)} L · Comida: ${Math.round(s.comida)}` +
          `<br>Tu madre: ${mari}` +
          (detours ? `<br>${detours === 1 ? 'Un desvío' : `${detours} desvíos`} en el camino` : '<br>Sin desvíos') +
          (s.lostCount ? `<br>Se perdieron ${s.lostCount === 1 ? 'una vez' : `${s.lostCount} veces`}` : '') +
          (s.rationedNights ? '<br>Racionaron el agua' : ''),
        [
          { label: 'Volver a empezar', onPick: () => window.location.reload() },
          { label: 'Ir al juego', onPick: () => (window.location.href = window.location.pathname) },
        ],
      ),
    );
  }

  // ---------------------------------------------------------------- controles

  private setPace(p: Pace): void {
    if (this.march.state.pace === p) return;
    sfx.select();
    this.march.setPace(p);
    this.march.setWaiting(false);
    this.refresh();
  }

  private toggleWait(): void {
    sfx.select();
    this.march.setWaiting(!this.march.state.waiting);
    this.refresh();
  }

  private buildTray(): void {
    const f = this.font;
    this.trayEl.innerHTML = `
      <div style="box-sizing:border-box; width:${VIEW.width}px; height:${VIEW.tray.h}px; padding:12px 12px 0; font-family:${f}; color:#EAE8E0;">
        <div style="display:flex; gap:4px;">
          ${PACES.map((p) => `<button data-pace="${p.id}" type="button" style="${btn()}">${p.label}</button>`).join('')}
          <button data-wait type="button" style="${btn()}">Esperar</button>
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:12px; font-size:7px;">
          <span style="color:#7FB0B8; letter-spacing:1px;">TU MADRE</span>
          <span style="flex:1; height:5px; background:#0E1416; border:1px solid rgba(217,168,69,0.35); position:relative;">
            <span data-mari style="position:absolute; left:0; top:0; bottom:0; width:50%; background:#586A46;"></span>
          </span>
          <span data-mari-word style="width:74px; text-align:right;"></span>
        </div>
        <div data-road style="margin-top:10px; font-size:6px; color:#7FB0B8; display:flex; align-items:center; gap:5px;"></div>
      </div>`;
    this.trayEl.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) =>
      b.addEventListener('click', () => this.setPace(b.dataset.pace as Pace)),
    );
    this.trayEl.querySelector<HTMLButtonElement>('[data-wait]')!.addEventListener('click', () => this.toggleWait());
  }

  /** HUD y bandeja al día con el estado de la marcha. */
  private refresh(): void {
    const s = this.march.state;
    const dots = [0, 1, 2, 3]
      .map((i) => `<span style="width:4px; height:4px; display:inline-block; transform:rotate(45deg); background:${i <= TURN_INDEX[s.turn]! ? '#D9A845' : '#3A4A50'};"></span>`)
      .join('');
    const aguaColor = s.agua < 4 ? '#DE7050' : '#EAE8E0';
    this.hudEl.innerHTML =
      `<div style="font-family:${this.font}; width:${VIEW.width}px; pointer-events:none;">` +
      `<div style="display:flex; align-items:center; justify-content:center; gap:6px; font-size:9px; padding-top:5px; color:#D9A845;">` +
      `<span>JORNADA ${s.day} · ${TURN_LABEL[s.turn]}</span><span style="display:inline-flex; gap:3px;">${dots}</span></div>` +
      `<div style="display:flex; gap:12px; font-size:8px; padding:5px 0 0 6px;">` +
      `<span><span style="color:#7FB0B8">AGUA</span> <span style="color:${aguaColor}">${Math.round(s.agua)}</span></span>` +
      `<span><span style="color:#7FB0B8">COMIDA</span> ${Math.round(s.comida)}</span></div></div>`;

    this.trayEl.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) => {
      const on = !s.waiting && b.dataset.pace === s.pace;
      paint(b, on);
    });
    paint(this.trayEl.querySelector<HTMLButtonElement>('[data-wait]')!, s.waiting);

    const bar = this.trayEl.querySelector<HTMLElement>('[data-mari]')!;
    bar.style.width = `${Math.round(s.mariStamina)}%`;
    bar.style.background = s.mariStamina < 30 ? '#9C3A24' : s.mariStamina < 55 ? '#A9791F' : '#586A46';
    const word =
      s.mariLag >= 8 ? 'se quedó atrás' : s.mariStamina < 30 ? 'no da más' : s.mariStamina < 55 ? 'cansada' : 'bien';
    const w = this.trayEl.querySelector<HTMLElement>('[data-mari-word]')!;
    w.textContent = word;
    w.style.color = s.mariStamina < 30 ? '#DE7050' : '#EAE8E0';

    // lo recorrido: una línea fina de Punta Cuevas al río (no un mapa: solo cuánto falta)
    const pct = Math.round(this.march.progress * 100);
    this.trayEl.querySelector<HTMLElement>('[data-road]')!.innerHTML =
      `<span>${this.march.track.from}</span>` +
      `<span style="flex:1; height:1px; background:rgba(217,168,69,0.3); position:relative;">` +
      `<span style="position:absolute; left:0; top:0; height:1px; width:${pct}%; background:#D9A845;"></span>` +
      `<span style="position:absolute; left:calc(${pct}% - 2px); top:-2px; width:4px; height:4px; transform:rotate(45deg); background:#9C3A24;"></span></span>` +
      `<span>${this.march.track.to}</span>`;
  }

  // ---------------------------------------------------------------- texto

  /** Línea de alguien de la columna (o del narrador), abajo del mundo, sin frenar la marcha. */
  private caption(who: string, text: string, ms = 3800): void {
    this.captionTimer?.remove();
    this.captionEl.innerHTML =
      `<div style="box-sizing:border-box; margin:0 10px; padding:7px 9px; font-family:${this.font}; font-size:7px; line-height:1.7; ` +
      `color:#EAE8E0; background:rgba(14,20,22,0.72); border:1px solid rgba(217,168,69,0.35); pointer-events:none; ` +
      `opacity:0; transition:opacity .4s;">` +
      (who ? `<div style="color:#D9A845; margin-bottom:3px;">${who}</div>` : '') +
      `${text}</div>`;
    const box = this.captionEl.firstElementChild as HTMLElement;
    requestAnimationFrame(() => (box.style.opacity = '1'));
    this.captionTimer = this.time.delayedCall(ms, () => (box.style.opacity = '0'));
  }

  /** Tarjeta en el medio del mundo (inicio, obstáculos, llegada). Mientras está, la marcha se detiene. */
  private showCard(title: string, body: string, options: Array<{ label: string; detail?: string; onPick: () => void }>): void {
    this.paused = true;
    this.captionTimer?.remove();
    this.captionEl.innerHTML = '';
    const f = this.font;
    this.cardEl.innerHTML = `
      <div style="box-sizing:border-box; width:${VIEW.width}px; height:${VIEW.world.h}px; display:flex; align-items:center; justify-content:center; background:rgba(14,20,22,0.35);">
        <div style="box-sizing:border-box; width:${VIEW.width - 28}px; padding:12px; font-family:${f}; color:#EAE8E0;
          background:linear-gradient(rgba(36,54,59,0.96), rgba(14,20,22,0.96)); border:1px solid rgba(217,168,69,0.55); box-shadow:0 4px 16px rgba(0,0,0,0.5);">
          <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#D9A845;">
            <span style="width:4px; height:4px; background:#9C3A24; transform:rotate(45deg); display:inline-block;"></span>${title}</div>
          <div style="height:1px; background:rgba(127,176,184,0.35); margin:8px 0 9px;"></div>
          <div style="font-size:7px; line-height:1.8;">${body}</div>
          <div data-opts style="display:flex; flex-direction:column; gap:5px; margin-top:11px;"></div>
        </div>
      </div>`;
    const opts = this.cardEl.querySelector('[data-opts]') as HTMLElement;
    const shownAt = performance.now();
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = btn(true) + ' text-align:left; padding:7px 9px; height:auto; line-height:1.6;';
      b.innerHTML = o.label + (o.detail ? `<div style="font-size:6px; color:#7FB0B8; margin-top:3px; line-height:1.6;">${o.detail}</div>` : '');
      paint(b, i === 0);
      b.addEventListener('pointerenter', () => paint(b, true));
      b.addEventListener('pointerleave', () => paint(b, i === 0));
      b.addEventListener('click', () => {
        if (performance.now() - shownAt < INPUT_GUARD.choiceMs) return;
        sfx.select();
        o.onPick();
      });
      opts.appendChild(b);
    });
  }

  private hideCard(): void {
    this.cardEl.innerHTML = '';
    this.paused = false;
  }

  private dom(x: number, y: number, w: number, h: number, depth: number): HTMLDivElement {
    const el = this.add.dom(x, y, 'div', `width:${w}px; height:${h}px; pointer-events:none;`).setOrigin(0, 0).setDepth(depth);
    const node = el.node as HTMLDivElement;
    // los hijos con botones sí reciben toques
    node.style.pointerEvents = 'none';
    const observer = new MutationObserver(() => node.querySelectorAll('button').forEach((b) => (b.style.pointerEvents = 'auto')));
    observer.observe(node, { childList: true, subtree: true });
    return node;
  }
}

/** Botón de vidrio con filete dorado (el estilo de todo el juego). */
function btn(card = false): string {
  return (
    `flex:1; height:${card ? 'auto' : '22px'}; box-sizing:border-box; margin:0; padding:0 2px; border-radius:0; cursor:pointer; ` +
    `font-family:${RETRO_FONT.replace(/"/g, "'")}; font-size:7px; letter-spacing:${card ? 0 : 0.5}px; white-space:${card ? 'normal' : 'nowrap'}; ` +
    'background:rgba(14,20,22,0.6); border:1px solid rgba(217,168,69,0.35); color:#BFD3D8; ' +
    'text-shadow:0 1px 0 #0E1416; -webkit-tap-highlight-color:transparent;'
  );
}

function paint(b: HTMLButtonElement, on: boolean): void {
  b.style.background = on ? 'linear-gradient(rgba(46,70,79,0.9), rgba(24,38,42,0.9))' : 'rgba(14,20,22,0.6)';
  b.style.borderColor = on ? '#D9A845' : 'rgba(217,168,69,0.35)';
  b.style.color = on ? '#D9A845' : '#BFD3D8';
}
