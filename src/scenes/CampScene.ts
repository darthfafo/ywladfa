import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { addSceneBackground } from '@/util/assets';
import { DialogueBox } from '@/ui/DialogueBox';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

interface CampData {
  dialogueId: string;
}

const MAX_SILUETAS = 4;

/**
 * El fogón nocturno como escena propia (CLAUDE.md R4, commit 9 de docs/02-arquitectura.md §10).
 * Pausa World y Ui, reemplaza el mundo por la fogata y corre la ronda de diálogo en la misma
 * bandeja de siempre. Al terminar, devuelve el control sin pantallas de por medio.
 */
export class CampScene extends Phaser.Scene {
  private dialogueId!: string;
  private dialogue!: DialogueBox;

  constructor() {
    super('Camp');
  }

  init(data: CampData): void {
    this.dialogueId = data.dialogueId;
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
    this.add.rectangle(h.x, h.y, h.w, h.h, PAL.ink, 0.96).setOrigin(0, 0);
    crisp(
      this.add
        .text(6, 4, `Jornada ${game.state.progress.day} · Noche`, {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.small,
          color: '#D9A845',
        })
        .setResolution(4),
    );

    const w = VIEW.world;
    // fuego grande o chico, mismo criterio que ya usa el diálogo de la segunda noche
    // (d_n1_fogon_j2, nodos g1/g1_frio) — si no hay PNG todavía, cae en el placeholder
    // de siempre (rectángulos + círculo animado) sin romper nada.
    const artId = game.res.get('lena') >= 2 ? 'fogon_grande' : 'fogon_chico';
    const bg = addSceneBackground(this, artId, w.x + w.w / 2, w.y + w.h / 2, w.w, w.h);
    if (!bg) this.add.rectangle(w.x, w.y, w.w, w.h, PAL.ink2).setOrigin(0, 0);
    this.add.rectangle(w.x, w.y + w.h - 60, w.w, 60, PAL.soil, bg ? 0.25 : 0.5).setOrigin(0, 0);

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

  private close(): void {
    this.scene.stop();
  }

  /** Por si la escena se cierra por otra vía (cambio de nivel, etc.), no dejar World/Ui pausados. */
  private restoreOnShutdown(): void {
    this.scene.resume('World');
    this.scene.resume('Ui');
    bus.emit('ui:hud-visible', { visible: true });
  }
}
