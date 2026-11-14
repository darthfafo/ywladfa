import Phaser from 'phaser';
import { PAL } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import { sfx } from '@/audio/Sfx';
import { addPropImage } from '@/util/assets';
import { tileCenter } from '@/util/grid';
import { FACING_FRAME } from '@/util/textures';
import type { Interactable, LevelScript, WorldHost } from './LevelScript';

/** Cuerpos sólidos de lo propio del Nivel 1 (px de mundo). La cueva copia el
 * afloramiento de World3D (3.4×2 tiles, frente 3 px al sur del centro del dibujo). */
const SOLID = {
  cajon: { w: 12, h: 6 },
  cueva: { w: 54, h: 32, frontPx: 3 },
} as const;

/**
 * El guion del Nivel 1 — Las cuevas: los cajones que se bajan a la pila, las
 * cuevas (elegir, apuntalar, arreglar), Dafydd que te sigue de vuelta del
 * manantial, la red que te saca del cañadón antes de tiempo y el cierre forzado
 * si se pasan los días. Antes vivía mezclado en WorldScene.
 */
export class Nivel01Script implements LevelScript {
  readonly campZone = 'z2_barranca';
  private carriedCajones = 0;
  /** Dafydd, de vuelta del manantial: sigue el rastro real de pasos del jugador
   * (no un tween en línea recta que cruzaba paredes). Ver sendDafyddHome(). */
  private dafyddFollow: Phaser.GameObjects.Image | null = null;
  private playerTrail: { x: number; y: number }[] = [];

  constructor(private readonly host: WorldHost) {}

  spawn(): void {
    const { scene, interactables } = this.host;
    const level = game.level;
    // al continuar una partida, los cajones que se llevaban encima siguen en el inventario
    this.carriedCajones = game.inv.count('cajon_provisiones');
    // cajones a bajar — si ya se entregaron los 8 (se retomó en J2/J3) no se vuelven a tirar en la playa
    const cajonesFaltan = Number(game.flags.get('n1_cajones_bajados') ?? 0) < level.spawns.cajones.length;
    if (cajonesFaltan) {
      for (const [i, c] of level.spawns.cajones.entries()) {
        const s = addPropImage(scene, 'cajon', tileCenter(c.x), tileCenter(c.y)) ?? scene.add.image(tileCenter(c.x), tileCenter(c.y), 'prop_cajon');
        s.setDepth(10);
        this.host.solid(s, SOLID.cajon.w, SOLID.cajon.h);
        interactables.push({ sprite: s, kind: 'cajon', id: `cajon_${i}`, label: 'Levantar' });
      }
    }
    // la pila donde se dejan: tierra adentro, lejos de la marea
    const dep = level.spawns.deposit;
    if (dep) {
      const pila = scene.add
        .rectangle(tileCenter(dep.x), tileCenter(dep.y), 26, 14, PAL.soil2, 0.55)
        .setStrokeStyle(1, PAL.sandLight, 0.8)
        .setDepth(9);
      interactables.push({ sprite: pila as unknown as Phaser.GameObjects.Image, kind: 'pila', id: 'pila', label: 'Dejar' });
    }
    for (const c of level.spawns.cuevas) {
      const s = addPropImage(scene, 'cueva', tileCenter(c.x), tileCenter(c.y)) ?? scene.add.image(tileCenter(c.x), tileCenter(c.y), 'prop_cueva');
      s.setDepth(8);
      // el afloramiento 3D es más grande que el dibujo 2D: el cuerpo copia ese bloque
      this.host.solid(s, SOLID.cueva.w, SOLID.cueva.h, SOLID.cueva.frontPx - s.displayHeight / 2);
      interactables.push({ sprite: s, kind: 'cueva', id: c.id, label: 'Entrar' });
    }
  }

  label(it: Interactable): string | undefined {
    if (it.kind !== 'cueva') return undefined;
    const chosen = game.flags.get('n1_cueva_elegida') as string | undefined;
    if (!chosen) return 'Elegir';
    if (it.id !== chosen) return 'Mirar';
    if (!game.flags.is('n1_apuntalado')) return 'Apuntalar';
    // tarea de la mañana del J2 (ch_n1_tareas): tapar las grietas de la propia cueva
    return this.host.triggerPending('trig_tarea_cuevas') ? 'Arreglar' : 'Mirar';
  }

  interact(it: Interactable): boolean {
    switch (it.kind) {
      case 'cajon':
        sfx.pickup();
        it.sprite.destroy();
        this.carriedCajones += 1;
        game.inv.add('cajon_provisiones', 1);
        return true;
      case 'pila': {
        if (this.carriedCajones === 0) {
          bus.emit('ui:pc-says', { text: 'No estoy cargando nada.' });
          return true;
        }
        const n = this.carriedCajones;
        game.inv.remove('cajon_provisiones', n);
        sfx.drop();
        this.carriedCajones = 0;
        const total = game.flags.inc('n1_cajones_bajados', n);
        bus.emit('ui:toast', { text: `Cajones bajados: ${total} de 8` });
        this.host.checkTriggers();
        return true;
      }
      case 'cueva': {
        // primero se elige la cueva; después, tocando la PROPIA, se la apuntala
        // (trig_apuntalar, manual): eso cierra la tarde del J1 y trae la noche
        const chosen = game.flags.get('n1_cueva_elegida') as string | undefined;
        if (!chosen) this.host.runTriggerById('trig_eleccion_cueva');
        else if (it.id !== chosen) bus.emit('ui:pc-says', { text: 'Esa no es la nuestra.' });
        else if (this.host.triggerPending('trig_tarea_cuevas')) {
          // tarea de la mañana de J2: arreglar la propia cueva
          sfx.knock();
          this.host.runTriggerById('trig_tarea_cuevas');
        } else if (game.flags.is('n1_apuntalado')) bus.emit('ui:pc-says', { text: 'Ya está apuntalada. Aguanta.' });
        // minijuego de los maderos (UiScene.openApuntalar); al terminar, onMinigame('apuntalar')
        else this.host.scene.events.emit('request-apuntalar');
        return true;
      }
    }
    return false;
  }

  /** Cierre del minijuego de apuntalar: casi sin errores, la entrada queda firme
   * (Mari duerme mejor); después, el trigger de siempre, que trae la noche. */
  onMinigame(id: string, misses: number): void {
    if (id !== 'apuntalar') return;
    const cfg = registry.levelBalance(game.state.progress.level).apuntalar as Record<string, number>;
    const firme = misses <= cfg.firmeMaxMisses!;
    game.applyEffects([
      { setFlag: { n1_apuntalado_firme: firme } },
      ...(firme ? [{ partyStat: { npc: 'npc_mari', health: cfg.firmeMariHealth! } }] : []),
    ]);
    this.host.runTriggerById('trig_apuntalar');
  }

  /** Al cerrar d_n1_manantial, Dafydd se despide y arranca a seguirte de vuelta al
   * campamento. El flag `_dafydd_se_fue` (que lo esconde) recién se pone cuando
   * llega a la barranca (onTile): `trig_manantial` ya puso `n1_encontro_manantial`
   * antes de abrir el diálogo, y usarlo escondía el sprite sin despedida. */
  onDialogueEnd(dialogueId: string): void {
    if (dialogueId !== 'd_n1_manantial') return;
    const it = this.host.interactables.find((x) => x.kind === 'npc' && x.id === 'npc_dafydd');
    if (!it || !it.sprite.visible) return;
    this.dafyddFollow = it.sprite;
    // camina detrás tuyo: si fuera sólido, darte vuelta te dejaba trabado contra él
    this.host.syncSolid(it.sprite, false);
    this.playerTrail = [{ x: this.host.player.x, y: this.host.player.y }];
  }

  holdsNpc(npcId: string): boolean {
    return npcId === 'npc_dafydd' && !!this.dafyddFollow;
  }

  refusal(npcId: string): string | undefined {
    // Dafydd caminando de vuelta ya dijo lo suyo: «Ahora no» no tiene sentido con él al lado
    return npcId === 'npc_dafydd' && this.dafyddFollow ? '— Volvamos al fogón.' : undefined;
  }

  onTile(zoneId: string | undefined): boolean {
    // Dafydd te siguió hasta la barranca: recién ahí se despide del todo
    if (this.dafyddFollow && zoneId === 'z2_barranca') {
      this.dafyddFollow.setVisible(false).setActive(false);
      this.dafyddFollow = null;
      this.playerTrail = [];
      game.flags.set('_dafydd_se_fue', true);
    }
    // red de contención: los pasajes al cañadón ya exigen n1_dafydd_perdido; si por lo
    // que sea el jugador termina adentro antes de tiempo, vuelve al fogón (siempre alcanzable)
    if (zoneId === 'z5_canadon' && !game.flags.is('n1_dafydd_perdido')) {
      const back = game.level.spawns.campamento ?? game.level.spawns.fogon;
      this.host.teleport(back.x, back.y);
      bus.emit('ui:pc-says', { text: 'Todavía no. Tengo que volver más tarde.' });
      this.host.checkTriggers();
      return true;
    }
    return false;
  }

  /** Dafydd sigue un punto de tu propio rastro con un retraso de DISTANCIA (no de
   * cuadros: parado no se le acorta el colchón), así su camino es el tuyo. */
  update(delta: number): void {
    if (!this.dafyddFollow) return;
    const MIN_GAP = 40; // separación real a lo largo del camino, casi un ancho de sprite
    const SAMPLE_DIST = 6;
    const MAX_TRAIL = 400;
    const player = this.host.player;
    const last = this.playerTrail[this.playerTrail.length - 1];
    if (!last || Math.hypot(player.x - last.x, player.y - last.y) >= SAMPLE_DIST) {
      this.playerTrail.push({ x: player.x, y: player.y });
      if (this.playerTrail.length > MAX_TRAIL) this.playerTrail.shift();
    }
    let acc = 0;
    let idx = this.playerTrail.length - 1;
    for (; idx > 0; idx--) {
      const a = this.playerTrail[idx]!;
      const b = this.playerTrail[idx - 1]!;
      acc += Math.hypot(a.x - b.x, a.y - b.y);
      if (acc >= MIN_GAP) break;
    }
    const target = this.playerTrail[idx]!;
    const sprite = this.dafyddFollow;
    const dx = target.x - sprite.x;
    const dy = target.y - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const speed = registry.balance.global.playerBaseSpeedPxPerSec as number;
    const step = Math.min(dist, (speed * delta) / 1000);
    sprite.x += (dx / dist) * step;
    sprite.y += (dy / dist) * step;
    sprite.setFrame(FACING_FRAME[Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north']);
  }

  /** R7: si ya se pasaron los días y el cierre (`trig_punta_final`) no disparó, se fuerza
   * en vez de dejar correr el reloj hacia una «Jornada 4» que no existe. */
  levelOverTrigger(): string | null {
    if (game.state.progress.day <= game.level.schedule.days) return null;
    if (!game.flags.get('n1_carga')) return null;
    return 'trig_punta_final';
  }
}
