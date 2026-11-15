import Phaser from 'phaser';
import { INPUT_GUARD, PAL, VIEW } from '@/config';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import { sfx } from '@/audio/Sfx';
import { MarchView3D, type MarchActor } from '@/render3d/MarchView3D';
import { MarchSystem, type MarchConfig, type MarchEvent, type MarchObstacle, type MarchStart, type Pace } from '@/systems/MarchSystem';
import { addPanel } from '@/ui/panel';
import { hasSceneArt, preloadArt } from '@/util/assets';
import { playCinematic } from '@/ui/cinematic';
import { busOn } from '@/util/scoped';
import { levelLabel, RETRO_FONT } from '@/util/text';
import { NPC_COLORS, PC_COLORS, resolveCharacterTexture } from '@/util/textures';

/**
 * Un nivel de marcha (data/levels/*.json con `kind: "march"`; hoy, el Nivel 2):
 * la columna en vista lateral, del golfo al río. La lógica es MarchSystem (con
 * tests); esto es la pantalla.
 *
 * Dos modos:
 * - **en el juego**: el nivel actual de la partida es una marcha (se llega con
 *   «Seguir viaje» al cerrar el Nivel 1, o con «Continuar»). Arranca con lo que
 *   hereda del Nivel 1 —agua, comida, la salud de tu madre, la moral, lo que
 *   quedó en Punta Cuevas, quién tiene vínculo con vos—, guarda cada noche y al
 *   llegar vuelca todo a la partida (Game.finishMarch) y pasa al cierre.
 * - **suelto** (`?marcha` en la URL): con los valores de prueba de balance.json,
 *   sin tocar la partida guardada.
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
  /**
   * Lo que se cuenta en el camino (líneas de la columna, ilustraciones, la noche,
   * los rodeos): nada se cierra solo. Cada mensaje frena la columna y queda hasta
   * que el jugador toca (o aprieta espacio/enter); si llegan varios juntos, salen
   * de a uno y en orden, y las decisiones esperan a que se hayan leído.
   */
  private msgs: Msg[] = [];
  private msgOpen = false;
  /** cierra el mensaje abierto (lo usa el toque, el espacio y el enter) */
  private advanceMsg: (() => void) | null = null;
  private font = RETRO_FONT.replace(/"/g, "'");
  /** ¿Es el nivel de la partida (true) o el prototipo suelto (?marcha)? */
  private integrated = false;
  private levelId = 'nivel-02';
  private playerName = 'Elin';
  private journalBtn: HTMLDivElement | null = null;

  constructor() {
    super('March');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    document.getElementById('boot-loading')?.remove();
    window.dispatchEvent(new Event('wladfa:ready-to-show'));

    // Phaser reutiliza la instancia de la escena: lo de la corrida anterior vuelve a cero
    this.mariShown = false;
    this.hungerTonight = false;
    this.journalBtn = null;
    this.integrated = game.isMarch;
    this.levelId = this.integrated ? game.state.progress.level : 'nivel-02';
    const level = registry.level(this.levelId);
    const cfg = registry.levelBalance(this.levelId).marcha as MarchConfig;
    const resume = this.integrated ? game.state.march : undefined;
    this.march = new MarchSystem(cfg, level.march!, this.integrated ? this.inherited() : {}, resume);
    this.playerName = this.integrated ? game.state.player.name : 'Elin';
    const pcTex = this.integrated && game.state.player.gender === 'm' ? 'pc_m' : 'pc_f';

    // la columna, con los personajes de siempre (arte real si ya existe)
    const actors: MarchActor[] = COLUMN.map((c) => {
      if (c.id.startsWith('horse')) return { id: c.id, texture: 'horse', z: c.z };
      const colors = c.id === 'pc' ? PC_COLORS[pcTex]! : NPC_COLORS[c.id]!;
      const key = resolveCharacterTexture(this, c.id === 'pc' ? pcTex : c.id, colors[0], colors[1], colors[2]).key;
      return { id: c.id, texture: key, z: c.z };
    });
    this.view = new MarchView3D(this, this.march.track, actors);
    const draw = () =>
      this.view?.render(this.game.loop.delta, this.march.state.pos, this.columnXs(), { inland: this.march.inland(), storm: this.march.stormHere() ? 1 : 0 });
    this.game.events.on(Phaser.Core.Events.POST_RENDER, draw);
    // la escena se reutiliza: la cola de mensajes arranca vacía cada vez
    this.msgs = [];
    this.msgOpen = false;
    this.advanceMsg = null;
    this.mariSaidDay = 0;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offTap?.();
      this.offTap = null;
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
    // la libreta (Diario y Códice), arriba a la derecha como en el Nivel 1; solo en el juego
    if (this.integrated && game.flags.is('unlocked_sistema_diario')) {
      const jb = this.dom(VIEW.width - 24, 5, 20, 16, 62);
      this.journalBtn = jb;
      jb.innerHTML =
        `<button type="button" aria-label="Libreta" style="width:18px; height:15px; padding:0; margin:0; border-radius:0; cursor:pointer; ` +
        `background:rgba(14,20,22,0.6); border:1px solid rgba(217,168,69,0.55); color:#D9A845; font-size:9px; line-height:1;">☰</button>`;
      jb.querySelector('button')!.addEventListener('click', () => this.openJournal());
    }
    this.buildTray();
    this.refresh();

    const kb = this.input.keyboard;
    kb?.on('keydown-ONE', () => this.setPace('aflojar'));
    kb?.on('keydown-TWO', () => this.setPace('normal'));
    kb?.on('keydown-THREE', () => this.setPace('apurar'));
    kb?.on('keydown-SPACE', () => (this.msgOpen ? this.advanceMsg?.() : this.toggleWait()));
    kb?.on('keydown-ENTER', () => this.advanceMsg?.());
    kb?.on('keydown-J', () => this.openJournal());
    // la libreta se dibuja encima: el HUD, la bandeja y los textos de la marcha se esconden mientras está abierta
    busOn(this, 'ui:hud-visible', ({ visible }) => {
      for (const el of [this.hudEl, this.trayEl, this.captionEl, this.cardEl]) el.style.visibility = visible ? '' : 'hidden';
      this.journalBtn?.style.setProperty('visibility', visible ? '' : 'hidden');
    });

    this.view.setTurn(this.march.state.turn);
    if (resume) {
      this.showCard(
        `Jornada ${resume.day}`,
        'La columna se levanta con la primera luz. Falta camino hasta el río.',
        [{ label: 'Seguir la marcha', onPick: () => this.hideCard() }],
      );
      return;
    }
    const intro = (): void => this.showCard(
      'La marcha',
      // 65 km y «tres días si el viento afloja, cuatro si no»: lo que anuncia Lewis en el Nivel 1 (docs/04 §1.1)
      'Del golfo al río, a pie: sesenta y cinco kilómetros de estepa. Tres días si el viento afloja, cuatro si no. Vos marcás el paso de la columna.' +
        '<br><br>Apurar llega antes, pero gasta más agua y cansa a tu madre. Esperar no acerca, pero el sol sigue andando.' +
        this.carryText() +
        '<br><br>Prestá atención a lo que se dice en el camino: nadie lo va a repetir.',
      [{ label: 'Salir de Punta Cuevas', onPick: () => this.hideCard() }],
    );
    this.paused = true;
    this.say({ text: 'Agosto de 1865. Se sale de Punta Cuevas en grupos de quince o veinte, con un par de caballos de carga. A pie, todos.', art: 'marcha_partida', then: intro, ownResume: true });
  }

  /**
   * Un mensaje del camino a la cola: texto (y quién lo dice) y, si existe el PNG,
   * su ilustración (src/assets/scenes/<art>.png, docs/09-arte-nivel-02.txt) sobre
   * el mundo. `then`: lo que pasa al cerrarlo. `ownResume`: `then` se ocupa de
   * volver a caminar (ej. la noche, que antes aclara el fundido).
   */
  private say(m: Msg): void {
    this.msgs.push(m);
    if (!this.msgOpen) this.nextMsg();
  }

  /** Algo que tiene que esperar a que se lean los mensajes (una decisión, la noche, la llegada). */
  private later(fn: () => void): void {
    if (this.msgOpen) this.msgs.push({ text: '', then: fn, ownResume: true });
    else fn();
  }

  private nextMsg(): void {
    const m = this.msgs.shift();
    if (!m) {
      this.msgOpen = false;
      this.advanceMsg = null;
      return;
    }
    this.msgOpen = true;
    // sin texto: es algo que esperaba su turno (later)
    if (!m.text) {
      m.then?.();
      this.nextMsg();
      return;
    }
    this.paused = true;
    const cine = m.art && hasSceneArt(m.art) ? playCinematic(this, m.art, { x: 0, y: VIEW.world.y, w: VIEW.width, h: VIEW.world.h }, 55) : null;
    this.caption(m.who ?? '', m.text);
    const shownAt = performance.now();
    let done = false;
    const close = (): void => {
      // un toque de más (o el mismo que cerró lo anterior) no saltea un mensaje sin leer
      if (done || performance.now() - shownAt < (cine ? INPUT_GUARD.choiceMs : INPUT_GUARD.dialogueStartMs)) return;
      done = true;
      this.offTap?.();
      this.offTap = null;
      cine?.close();
      this.captionEl.innerHTML = '';
      this.msgOpen = false;
      this.advanceMsg = null;
      // lo que sigue puede sumar mensajes (ej. después de un extravío, quién salió a buscarte)
      m.then?.();
      if (this.msgOpen) return;
      if (this.msgs.length) this.nextMsg();
      else if (!m.ownResume) this.resume();
    };
    this.advanceMsg = close;
    // un toque en cualquier lado, salvo en un botón (cambiar el paso no cierra el mensaje); en la ventana y no
    // en el canvas: encima del mundo hay capas HTML (la ilustración, la tarjeta) que se quedan con el toque
    const onTap = (ev: PointerEvent): void => {
      if ((ev.target as HTMLElement | null)?.closest?.('button')) return;
      // con la libreta abierta encima, los toques son de la libreta
      if (this.scene.isActive('Journal')) return;
      close();
    };
    window.addEventListener('pointerdown', onTap);
    this.offTap = () => window.removeEventListener('pointerdown', onTap);
  }

  private offTap: (() => void) | null = null;

  /** Vuelve a caminar, salvo que haya una decisión abierta. */
  private resume(): void {
    if (!this.cardEl.innerHTML && !this.msgOpen) this.paused = false;
  }

  /** Lo que la marcha hereda del Nivel 1 (en el juego; suelto, nada). */
  private inherited(): MarchStart {
    const taken = game.flags.get('n1_carga') as string[] | undefined;
    const inColumn = new Set(COLUMN.map((c) => c.id));
    // con vínculo (fogones del Nivel 1): el más cercano sale a buscarte si te perdés
    const helper = game.state.party
      .filter((p) => p.id !== 'npc_mari' && inColumn.has(p.id) && p.bond >= 1)
      .sort((a, b) => b.bond - a.bond)[0];
    return {
      agua: game.res.get('agua'),
      comida: game.res.get('comida'),
      mariHealth: game.party.member('npc_mari')?.health,
      morale: game.state.morale,
      left: taken ? registry.bultos.filter((b) => !taken.includes(b.id)).map((b) => b.id) : [],
      bondHelper: helper?.id ?? null,
    };
  }

  /** En la tarjeta de salida: con qué se sale y lo que pesa de lo que quedó en Punta Cuevas. */
  private carryText(): string {
    if (!this.integrated) return '';
    const s = this.march.state;
    const out = [`Salen con ${Math.round(s.agua)} L de agua y ${Math.round(s.comida)} raciones.`];
    if (s.left.includes('abrigo')) out.push('La ropa de abrigo quedó en la playa: las noches van a ser largas.');
    if (s.left.includes('harina')) out.push('La harina quedó en la playa: la comida no va a alcanzar.');
    if (s.left.includes('libros')) out.push('Los libros quedaron en la playa.');
    return `<br><br><span style="color:#7FB0B8">${out.join(' ')}</span>`;
  }

  /** La libreta (Diario y Códice), con la marcha en pausa. Solo en el juego. */
  private openJournal(): void {
    // la libreta, desde que Berwyn la da (Nivel 1, unlocked_sistema_diario)
    if (!this.integrated || !game.flags.is('unlocked_sistema_diario') || this.scene.isActive('Journal')) return;
    this.scene.launch('Journal', { tab: 'diario', pause: ['March'] });
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
        this.say({ who: registry.speakerName(e.speaker, this.playerName), text: e.text });
        break;
      case 'turn':
        this.view?.setTurn(e.turn);
        break;
      case 'obstacle':
        this.later(() => this.obstacle(e.obstacle));
        break;
      case 'night':
        this.later(() => this.night(e.day, e.option));
        break;
      case 'lowMorale':
        // sin ánimo: el grupo camina más lento y se nota
        this.say({ who: 'Richard Jones Berwyn', text: '¿Cuánto falta? Nadie dijo que iba a ser así.' });
        if (this.integrated) game.marchDecision('moral_baja', 'si', this.march.state.day);
        break;
      case 'scene':
        this.say({ text: e.text, art: e.id });
        break;
      case 'mariBehind':
        // la primera vez, con ilustración si existe
        // frena la columna hasta que se lea: una vez por jornada (las demás, lo dice la bandeja en rojo)
        if (this.mariSaidDay === this.march.state.day) break;
        if (this.mariShown) this.say({ text: 'Tu madre se quedó atrás. La columna para a esperarla.' });
        else this.say({ text: 'Tu madre se sienta en un bulto. No da un paso más. La columna para a esperarla.', art: 'marcha_mari' });
        this.mariShown = true;
        this.mariSaidDay = this.march.state.day;
        break;
      case 'thirst':
        this.say({ who: 'Lewis Jones', text: 'Se terminó el agua. Despacio, y nadie se separa.' });
        break;
      case 'arrived':
        this.later(() => this.arrived());
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
    if (o.type === 'aguada')
      return this.march.state.variant[o.id] === 'seca'
        ? 'Barro seco y raíces. Apenas un trago para cada uno, y la hora perdida.'
        : 'Bajo las matas hay un hilo de agua. Se llenan los barriles.';
    if (o.type === 'trail') return 'La rastrillada baja hasta un jagüel: agua turbia, pero agua. Pasan cerca de los toldos callados, sin mirar.';
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
      (o.options ?? []).map((opt) => {
        // lo arriesgado pide ánimo: con la moral baja, nadie quiere
        const ok = this.march.available(opt);
        return {
          label: opt.text,
          detail: ok ? opt.detail : 'Con el ánimo como está, nadie quiere arriesgarse.',
          disabled: !ok,
          onPick: () => (opt.drop ? this.pickDrop(o, opt.id) : this.decide(o, opt.id)),
        };
      }),
    );
  }

  /** Dejar algo en la estepa: raciones, o uno de los bultos que se trajeron de Punta Cuevas. */
  private pickDrop(o: MarchObstacle, optId: string): void {
    const items = o.dropItems ?? {};
    const taken = this.integrated ? ((game.flags.get('n1_carga') as string[] | undefined) ?? []) : [];
    const ids = ['raciones', ...taken].filter((id) => items[id] && !this.march.state.dropped.includes(id));
    const label = (id: string): string => items[id]!.label ?? registry.bultos.find((b) => b.id === id)?.label ?? id;
    this.showCard(
      '¿Qué se deja?',
      'El caballo no puede con todo. Lo que quede acá no vuelve.',
      [
        ...ids.map((id) => ({ label: label(id), detail: items[id]!.detail, onPick: () => this.decide(o, optId, id) })),
        { label: 'Mejor repartir la carga.', detail: 'Volver atrás: nadie deja nada.', onPick: () => this.obstacle(o) },
      ],
    );
  }

  /** Aplica la decisión, la anota en la partida y muestra lo que pasa. */
  private decide(o: MarchObstacle, optId: string, dropId?: string): void {
    this.hideCard();
    const day = this.march.state.day;
    const hungry = this.march.state.hungryNights;
    const ev = this.march.choose(optId, dropId);
    // en el juego, cada decisión queda en la partida (flags del nivel → el diario)
    if (this.integrated) {
      const extra: Record<string, string> = {};
      if (dropId) extra[`${o.id}_dejado`] = dropId;
      const v = this.march.state.variant[o.id];
      if (v) extra[`${o.id}_variante`] = v;
      game.marchDecision(o.type === 'night' ? `noche_${day}` : o.id, optId, day, extra);
    }
    if (o.type === 'night') this.hungerTonight = this.march.state.hungryNights > hungry;
    const skip = ev.find((x) => x.type === 'skip') as Extract<MarchEvent, { type: 'skip' }> | undefined;
    const rest = ev.filter((x) => x.type !== 'skip');
    const after = (): void => {
      rest.forEach((x) => this.onEvent(x));
      if (skip?.kind !== 'lost') return;
      // con vínculo, alguien salió a buscarte (Nivel 1: los fogones)
      if (skip.helper) this.say({ who: registry.speakerName(skip.helper, this.playerName), text: 'Te vi dar vueltas y salí a buscarte. Por acá: allá está el sur.' });
      else this.say({ who: 'Lewis Jones', text: o.lostLine ?? 'Íbamos para cualquier lado.' });
    };
    if (skip) this.fadeThrough(this.skipText(o, skip.kind), after, skip.kind === 'lost' ? 'marcha_perdidos' : undefined);
    else after();
  }

  private hungerTonight = false;
  private mariShown = false;
  /** la jornada en que se avisó que tu madre se quedó atrás */
  private mariSaidDay = 0;

  private night(day: number, option: { id: string }): void {
    this.paused = true;
    const s = this.march.state;
    // lo que pesa de lo que quedó en Punta Cuevas, y si la comida no alcanzó
    const extra = [
      this.hungerTonight ? 'La comida no alcanzó para todos.' : '',
      s.left.includes('abrigo') ? 'Sin ropa de abrigo, el frío no deja dormir.' : '',
      day === 1 && s.left.includes('libros') ? 'Sin libros, esta noche nadie lee en voz alta.' : '',
    ].filter(Boolean);
    // en el juego, cada noche se guarda la partida con la columna tal como está
    if (this.integrated) game.saveMarch(this.march.snapshot());
    this.tweens.add({
      targets: this.fade,
      fillAlpha: 1,
      duration: 900,
      onComplete: () => {
        const text =
          (option.id === 'luna'
            ? `Noche ${day}: caminan con la luna, sin dormir. Nadie habla. Al amanecer la huella sigue, y ellos también.`
            : option.id === 'racionar'
              ? `Noche ${day} a la intemperie. Media ración y la mitad del agua. Tu madre tirita hasta el amanecer.`
              : `Noche ${day} a la intemperie. El fuego dura poco, pero alcanza. Tu madre duerme.`) +
            (extra.length ? ` ${extra.join(' ')}` : '') +
            (this.integrated ? '<br><span style="color:#7FB0B8">Partida guardada.</span>' : '');
        const back = (): void => {
          this.paused = true;
          this.view?.setTurn(this.march.state.turn);
          this.tweens.add({ targets: this.fade, fillAlpha: 0, duration: 1100, onComplete: () => this.resume() });
        };
        // el fogón a cielo abierto, si ya está la ilustración (no si caminaron); si no, en negro con el texto
        this.say({ text, art: option.id !== 'luna' ? 'marcha_noche' : undefined, then: back, ownResume: true });
      },
    });
  }

  private fadeThrough(text: string, after: () => void, art?: string): void {
    this.paused = true;
    this.tweens.add({
      targets: this.fade,
      fillAlpha: 1,
      duration: 600,
      onComplete: () => {
        const back = (): void => {
          after();
          this.tweens.add({ targets: this.fade, fillAlpha: 0, duration: 700, onComplete: () => this.resume() });
        };
        this.say({ text, art, then: back, ownResume: true });
      },
    });
  }

  /** Cómo se llega: antes o después que los otros grupos, y cómo viene tu madre (level.arrival). */
  private arrivalText(): string {
    const s = this.march.state;
    const arr = registry.level(this.levelId).arrival;
    if (!arr) return '';
    const byDay = arr.byDay.find((x) => x.maxDay === undefined || s.day <= x.maxDay)?.text ?? '';
    const sickBelow = registry.levelBalance(this.levelId).marcha?.mariSickBelow as number | undefined;
    const sick = sickBelow !== undefined && s.mariHealth < sickBelow ? ` ${arr.sick}` : '';
    return `<span style="color:#BFD3D8">${byDay}${sick}</span>`;
  }

  private arrived(): void {
    const s = this.march.state;
    this.paused = true;
    // en el juego: todo lo de la marcha vuelve a la partida (por los sistemas), diario y guardado
    if (this.integrated) game.finishMarch(this.march.snapshot());
    const mari = s.mariHealth >= 60 ? 'cansada, pero entera' : s.mariHealth >= 40 ? 'débil' : 'muy débil';
    // cuántas veces se eligió el camino largo (rodeo o desvío a una aguada)
    const detours = this.march.track.obstacles.filter((o) => o.options?.find((x) => x.id === s.resolved[o.id])?.extraTiles).length;
    this.time.delayedCall(1200, () =>
      this.showCard(
        'El río',
        `Agua que corre, sauces y las paredes de barro del fuerte viejo: Caer Antur. Jornada ${s.day}, ${TURN_LABEL[s.turn]!.toLowerCase()}.` +
          `<br><br>${this.arrivalText()}` +
          `<br><br>Agua: ${Math.round(s.agua)} L · Comida: ${Math.round(s.comida)}` +
          `<br>Tu madre: ${mari}` +
          (detours ? `<br>${detours === 1 ? 'Un desvío' : `${detours} desvíos`} en el camino` : '<br>Sin desvíos') +
          (s.lostCount ? `<br>Se perdieron ${s.lostCount === 1 ? 'una vez' : `${s.lostCount} veces`}` : '') +
          (s.rationedNights ? '<br>Racionaron el agua' : ''),
        this.integrated
          ? [
              { label: 'Seguir', onPick: () => this.scene.start('Transition', { next: registry.level(this.levelId).next }) },
              { label: 'Leer el diario', onPick: () => this.openJournal() },
            ]
          : [
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
            <span data-mari-health style="position:absolute; left:0; bottom:-4px; height:2px; width:50%; background:#B07A52;"></span>
          </span>
          <span data-mari-word style="width:84px; text-align:right; white-space:nowrap;"></span>
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
      // 7px y centrado en lo que deja libre el ☰: con el nivel no entra a 9px en 270 de ancho
      `<div style="display:flex; align-items:center; justify-content:center; gap:6px; font-size:7px; padding:6px 22px 0 0; color:#D9A845;">` +
      `<span><span style="color:#7FB0B8;">${levelLabel(this.levelId)} · </span>JORNADA ${s.day} · ${TURN_LABEL[s.turn]}</span><span style="display:inline-flex; gap:3px;">${dots}</span></div>` +
      `<div style="display:flex; gap:12px; font-size:8px; padding:5px 0 0 6px;">` +
      `<span><span style="color:#7FB0B8">AGUA</span> <span style="color:${aguaColor}">${Math.round(s.agua)}</span></span>` +
      `<span><span style="color:#7FB0B8">COMIDA</span> ${Math.round(s.comida)}</span>` +
      // la moral: por debajo de la marca el grupo camina más lento
      `<span><span style="color:#7FB0B8">MORAL</span> <span style="color:${s.morale < (registry.levelBalance(this.levelId).marcha?.morale?.slowBelow ?? 35) ? '#DE7050' : '#EAE8E0'}">${Math.round(s.morale)}</span></span></div></div>`;

    this.trayEl.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) => {
      const on = !s.waiting && b.dataset.pace === s.pace;
      paint(b, on);
    });
    paint(this.trayEl.querySelector<HTMLButtonElement>('[data-wait]')!, s.waiting);

    const bar = this.trayEl.querySelector<HTMLElement>('[data-mari]')!;
    bar.style.width = `${Math.round(s.mariStamina)}%`;
    bar.style.background = s.mariStamina < 30 ? '#9C3A24' : s.mariStamina < 55 ? '#A9791F' : '#586A46';
    // la palabra: lo más grave primero (la salud), después el aire
    const sickBelow = registry.levelBalance(this.levelId).marcha?.mariSickBelow ?? 35;
    const word =
      s.mariHealth < sickBelow ? 'enferma' : s.mariLag >= 8 ? 'quedó atrás' : s.mariStamina < 30 ? 'no da más' : s.mariStamina < 55 ? 'cansada' : 'bien';
    const w = this.trayEl.querySelector<HTMLElement>('[data-mari-word]')!;
    w.textContent = word;
    w.style.color = s.mariStamina < 30 || s.mariHealth < sickBelow ? '#DE7050' : '#EAE8E0';
    // la salud, una línea fina debajo del aire: baja de a poco y no vuelve sola
    const hb = this.trayEl.querySelector<HTMLElement>('[data-mari-health]')!;
    hb.style.width = `${Math.round(s.mariHealth)}%`;
    hb.style.background = s.mariHealth < sickBelow ? '#DE7050' : '#B07A52';

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

  /** El texto del mensaje abierto, abajo del mundo: queda hasta que se toque (nextMsg). */
  private caption(who: string, text: string): void {
    this.captionEl.innerHTML =
      `<div style="box-sizing:border-box; margin:0 10px; padding:7px 9px; font-family:${this.font}; font-size:7px; line-height:1.7; ` +
      `color:#EAE8E0; background:rgba(14,20,22,0.78); border:1px solid rgba(217,168,69,0.35); pointer-events:none; ` +
      `opacity:0; transition:opacity .4s;">` +
      `<style>@keyframes msg-tap { 0%,100% { opacity:.35 } 50% { opacity:1 } }</style>` +
      (who ? `<div style="color:#D9A845; margin-bottom:3px;">${who}</div>` : '') +
      `${text}` +
      `<div style="text-align:right; margin-top:4px; font-size:6px; color:#D9A845; animation: msg-tap 1.6s ease-in-out infinite;">Tocá para seguir ›</div></div>`;
    const box = this.captionEl.firstElementChild as HTMLElement;
    requestAnimationFrame(() => (box.style.opacity = '1'));
  }

  /** Tarjeta en el medio del mundo (inicio, obstáculos, llegada). Mientras está, la marcha se detiene. */
  private showCard(title: string, body: string, options: Array<{ label: string; detail?: string; disabled?: boolean; onPick: () => void }>): void {
    this.paused = true;
    const f = this.font;
    // con muchas opciones (qué dejar en la estepa) todo más apretado: tiene que entrar
    // en la franja del mundo, y en el celular no hay scroll (main.ts bloquea el touchmove)
    const compact = options.length > 4;
    this.cardEl.innerHTML = `
      <div style="box-sizing:border-box; width:${VIEW.width}px; height:${VIEW.world.h}px; display:flex; align-items:center; justify-content:center; background:rgba(14,20,22,0.35);">
        <div style="box-sizing:border-box; width:${VIEW.width - 28}px; padding:${compact ? 9 : 12}px; font-family:${f}; color:#EAE8E0;
          background:linear-gradient(rgba(36,54,59,0.96), rgba(14,20,22,0.96)); border:1px solid rgba(217,168,69,0.55); box-shadow:0 4px 16px rgba(0,0,0,0.5);">
          <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#D9A845;">
            <span style="width:4px; height:4px; background:#9C3A24; transform:rotate(45deg); display:inline-block;"></span>${title}</div>
          <div style="height:1px; background:rgba(127,176,184,0.35); margin:8px 0 9px;"></div>
          <div style="font-size:7px; line-height:1.8;">${body}</div>
          <div data-opts style="display:flex; flex-direction:column; gap:${compact ? 3 : 5}px; margin-top:${compact ? 8 : 11}px;"></div>
        </div>
      </div>`;
    const opts = this.cardEl.querySelector('[data-opts]') as HTMLElement;
    const shownAt = performance.now();
    const first = options.findIndex((o) => !o.disabled);
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = btn(true) + ` text-align:left; padding:${compact ? '4px 8px' : '7px 9px'}; height:auto; line-height:${compact ? 1.4 : 1.6};`;
      b.innerHTML = o.label + (o.detail ? `<div style="font-size:6px; color:#7FB0B8; margin-top:${compact ? 1 : 3}px; line-height:1.5;">${o.detail}</div>` : '');
      if (o.disabled) {
        // se ve, pero no se puede: el motivo va en el detalle
        b.style.opacity = '0.45';
        b.style.cursor = 'default';
        opts.appendChild(b);
        return;
      }
      paint(b, i === first);
      b.addEventListener('pointerenter', () => paint(b, true));
      b.addEventListener('pointerleave', () => paint(b, i === first));
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
    this.resume();
  }

  private dom(x: number, y: number, w: number, h: number, depth: number): HTMLDivElement {
    const el = this.add.dom(x, y, 'div', `width:${w}px; height:${h}px; pointer-events:none;`).setOrigin(0, 0).setDepth(depth);
    // Phaser reescribe `pointer-events` en cada cuadro con esta propiedad (por defecto 'auto'): con 'auto', la
    // tarjeta vacía (270×352, encima del mundo) se comía todos los toques y nada de abajo los recibía
    el.pointerEvents = 'none';
    const node = el.node as HTMLDivElement;
    // los hijos con botones sí reciben toques
    node.style.pointerEvents = 'none';
    const observer = new MutationObserver(() => node.querySelectorAll('button').forEach((b) => (b.style.pointerEvents = 'auto')));
    observer.observe(node, { childList: true, subtree: true });
    return node;
  }
}

/** Un mensaje del camino (ver MarchScene.say). */
interface Msg {
  who?: string;
  text: string;
  art?: string;
  then?: () => void;
  ownResume?: boolean;
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
