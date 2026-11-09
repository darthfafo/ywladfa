import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import type { UiScene } from '@/scenes/UiScene';
import type { WorldScene } from '@/scenes/WorldScene';
import { playCinematic } from '@/ui/cinematic';
import { DialogueBox } from '@/ui/DialogueBox';
import { FONT, RETRO_FONT } from '@/util/text';
import { addPanel } from '@/ui/panel';
import { sfx } from '@/audio/Sfx';

interface CampData {
  dialogueId: string;
  night?: number;
}

const MAX_SILUETAS = 4;

/**
 * El fogón nocturno como escena propia (CLAUDE.md R4, commit 9 de docs/02-arquitectura.md §10).
 * Pausa World y Ui, reemplaza el mundo por la fogata y corre la ronda de diálogo en la misma
 * bandeja de siempre. Al terminar, devuelve el control sin pantallas de por medio.
 */
export class CampScene extends Phaser.Scene {
  private dialogueId!: string;
  private night!: number;
  private dialogue!: DialogueBox;

  constructor() {
    super('Camp');
  }

  init(data: CampData): void {
    this.dialogueId = data.dialogueId;
    // el trigger que abre esta escena ya gastó su turno (TriggerSystem.consume) antes
    // de llegar acá, y eso puede haber hecho rodar game.state.progress.day — por eso
    // el número de jornada viaja como dato del trigger (action.payload.night en
    // data/levels/nivel-01.json), no se lee en vivo. El fallback es solo para no
    // romper si algún día se lanza Camp sin pasar por un trigger de fogón.
    this.night = data.night ?? game.state.progress.day;
  }

  create(): void {
    this.scene.bringToTop();
    this.scene.pause('World');
    this.scene.pause('Ui');
    // pausar Ui no la oculta: el HUD es HTML aparte del canvas y se queda flotando
    // arriba de esta escena sin importar el depth.
    bus.emit('ui:hud-visible', { visible: false });

    this.buildNightScene();

    this.dialogue = new DialogueBox(this);
    this.dialogue.start(this.dialogueId, () => this.close());

    this.events.once('shutdown', () => this.restoreOnShutdown());
  }

  private buildNightScene(): void {
    this.add.rectangle(0, 0, VIEW.width, VIEW.height, PAL.void).setOrigin(0, 0);

    const h = VIEW.hud;
    addPanel(this, h.x, h.y, h.w, h.h, { top: PAL.ink2, bottom: PAL.void, dropShadow: 'down' }).setDepth(1);
    // mismo encabezado que el HUD del juego (UiScene.refreshTime): HTML nítido,
    // con los cuatro rombos de turno encendidos. Antes era Text de Phaser debajo
    // del panel (profundidad 0 contra 1): la franja quedaba vacía.
    const dots = Array.from({ length: 4 }, () => '<span style="width:4px; height:4px; display:inline-block; transform:rotate(45deg); background:#D9A845;"></span>').join('');
    this.add
      .dom(h.x, 11, 'div', `pointer-events:none; font-family: ${RETRO_FONT}; font-size:${FONT.tiny}; width:${h.w}px;`)
      .setOrigin(0, 0)
      .setDepth(2)
      .setHTML(
        `<div style="display:flex; align-items:center; justify-content:center; gap:6px;">` +
          `<span style="color:#D9A845;">JORNADA ${this.night} · NOCHE</span>` +
          `<span style="display:inline-flex; gap:3px;">${dots}</span></div>`,
      );

    const w = VIEW.world;
    // fuego grande o chico según lo que REALMENTE se prendió anoche (game.flags,
    // ver Game.runNight) — no la leña que queda ahora: ResourceSystem.applyNight()
    // ya la descontó antes de que esto se lea, así que "leña actual >= 2" casi
    // nunca coincidía con el fuego real (con 2 de leña, fuego grande la consume
    // toda y dejaba 0 — se mostraba fogon_chico igual). Si no hay PNG todavía,
    // cae en el placeholder de siempre (rectángulos + círculo animado).
    const artId = game.flags.get('_lastFire') === 'bigFire' ? 'fogon_grande' : 'fogon_chico';
    // adentro de la cueva: fuego crepitando y el viento de afuera, apagado
    sfx.setAmbience({ fire: artId === 'fogon_grande' ? 1 : 0.55, wind: 0.25 });
    // entrada animada, movimiento lento y brasas subiendo (ui/cinematic.ts)
    const bg = playCinematic(this, artId, { x: w.x, y: w.y, w: w.w, h: w.h }, 0).image;
    // piso del placeholder; con ilustración real no va (tapaba el borde de abajo)
    if (!bg) this.add.rectangle(w.x, w.y + w.h - 60, w.w, 60, PAL.soil, 0.5).setOrigin(0, 0).setDepth(1);

    // el fuego animado y las siluetas eran EL placeholder de toda la escena — ahora
    // que fogon_grande/fogon_chico ya pintan gente sentada alrededor del fuego, se
    // dibujaban los dos a la vez, superpuestos. Con arte real, ninguno de los dos
    // hace falta; sin arte, siguen siendo el placeholder de siempre.
    if (!bg) {
      this.add.rectangle(w.x, w.y, w.w, w.h, PAL.ink2).setOrigin(0, 0);
      const fireY = w.y + w.h - 70;
      const glow = this.add.circle(VIEW.width / 2, fireY, 26, PAL.wheat, 0.18);
      const fire = this.add.circle(VIEW.width / 2, fireY, 10, PAL.coiron, 0.9);
      this.tweens.add({
        targets: [glow, fire],
        scale: 1.12,
        alpha: '*=0.85',
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });

      const count = Math.min(MAX_SILUETAS, game.state.party.length);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 1.4 + Math.PI * 0.15;
        const x = VIEW.width / 2 + Math.cos(angle) * 36;
        const y = fireY + Math.sin(angle) * 14;
        this.add.ellipse(x, y, 12, 18, PAL.void, 0.8).setStrokeStyle(1, PAL.ink2, 0.7);
      }
    }
  }

  private close(): void {
    this.scene.stop();
  }

  /** Por si la escena se cierra por otra vía (cambio de nivel, etc.), no dejar World/Ui pausados. */
  private restoreOnShutdown(): void {
    this.scene.resume('World');
    this.scene.resume('Ui');
    // hud-visible ANTES de tocar cualquier diálogo nuevo: pisa touch/HUD a mano
    // (ver UiScene.setHudVisible) y si corriera DESPUÉS de abrir uno, se lo tapaba
    // — el joystick volvía a aparecer encima de un diálogo con el juego bloqueado
    // (input.locked), que es exactamente lo que se veía "trabado" cada amanecer.
    bus.emit('ui:hud-visible', { visible: true });

    const world = this.scene.get('World') as WorldScene;
    const ui = this.scene.get('Ui') as UiScene;
    world.refreshAmbience();
    // te despertás en el campamento, no donde te agarró el sueño — si la noche cayó
    // mientras todavía andabas explorando (ej. volviendo del manantial), World seguía
    // pausado ahí mismo y al reanudar aparecías en pleno cañadón en la jornada nueva.
    // La cutscene de amanecer (si corresponde) va ANTES de reposicionar: así cierra
    // sola del todo (su propio diálogo, su propio cierre) antes de que
    // wakeAtCamp()→trackTile() pueda disparar trig_amanecer_j2 — nunca compiten por
    // el mismo DialogueBox (ver UiScene.showSunrise).
    if (game.state.progress.turn === 'amanecer') {
      ui.showSunrise(game.state.progress.day, () => world.wakeAtCamp());
    } else {
      world.wakeAtCamp();
    }
  }
}
