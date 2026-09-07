import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { input } from '@/util/input';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

const CFG = {
  baseRadius: 20,
  thumbRadius: 9,
  deadZone: 4,
  buttonSize: 40, // no más grande que la base del joystick (40 = 2×baseRadius)
  grabRadius: 30, // zona de agarre más generosa que el círculo visual del joystick,
  // pero no tanto como para pisar el botón (ver distancia botón↔joystick abajo)
  anchorX: VIEW.width - 30,
  gap: 44, // separación desde el centro vertical del mapa a cada control
};

/**
 * Joystick fijo + botón de acción, los dos sobre el mapa (no en la bandeja): al borde
 * derecho de la pantalla y centrados verticalmente en el viewport del mundo, para que
 * el pulgar los alcance cómodo sosteniendo el celular con una mano, sin competir por
 * espacio con el texto de la bandeja. Antes vivían apilados dentro de la bandeja de
 * 96px, más incómodos de alcanzar y más pegados entre sí.
 */
export class TouchControls {
  private base: Phaser.GameObjects.Arc;
  private thumb: Phaser.GameObjects.Arc;
  private button: Phaser.GameObjects.Container;
  private buttonHit: Phaser.GameObjects.Arc;
  private buttonLabel: Phaser.GameObjects.Text;
  private origin: Phaser.Math.Vector2;
  private pointerId: number | null = null;

  constructor(scene: Phaser.Scene) {
    const world = VIEW.world;
    const centerY = world.y + world.h / 2;
    const jx = CFG.anchorX;
    const jy = centerY + CFG.gap;
    this.origin = new Phaser.Math.Vector2(jx, jy);

    const bx = CFG.anchorX;
    const by = centerY - CFG.gap;
    // la zona de agarre del joystick (grabRadius) y el hitArea del botón (buttonSize/2)
    // no se pueden pisar: la distancia entre centros tiene que ser mayor a la suma de
    // los dos radios, si no, a veces el toque en el botón termina moviendo al joystick.

    const circle = scene.add.circle(0, 0, CFG.buttonSize / 2, PAL.slate, 0.85).setStrokeStyle(1, PAL.seaPale, 0.8);
    this.buttonLabel = crisp(
      scene.add
        .text(0, 0, '·', { fontFamily: FONT_FAMILY, fontSize: FONT.tiny, color: '#EAE8E0', align: 'center' })
        .setOrigin(0.5)
        .setResolution(4),
    );
    this.button = scene.add.container(bx, by, [circle, this.buttonLabel]).setDepth(52).setAlpha(0.5);

    // el hit-test vive en el CONTAINER, no en el círculo hijo: un toque rápido después
    // de soltar el joystick a veces no llegaba a la forma interactiva anidada.
    this.buttonHit = scene.add.circle(bx, by, CFG.buttonSize / 2 + 4, 0, 0).setDepth(53);
    this.buttonHit.setInteractive({
      hitArea: new Phaser.Geom.Circle(0, 0, CFG.buttonSize / 2 + 4),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });
    this.buttonHit.on('pointerdown', () => {
      if (input.locked) return;
      input.pressAction();
      this.button.setScale(0.92);
    });
    this.buttonHit.on('pointerup', () => this.button.setScale(1));
    this.buttonHit.on('pointerout', () => this.button.setScale(1));

    // joystick fijo: base y agarre siempre en el mismo lugar, nunca se mueven
    this.base = scene.add.circle(jx, jy, CFG.baseRadius, PAL.bone, 0.16).setDepth(50).setStrokeStyle(1, PAL.bone, 0.3);
    this.thumb = scene.add.circle(jx, jy, CFG.thumbRadius, PAL.bone, 0.45).setDepth(51);

    this.base.setInteractive(new Phaser.Geom.Circle(0, 0, CFG.grabRadius), Phaser.Geom.Circle.Contains);
    this.base.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (input.locked) return;
      this.pointerId = p.id;
      this.updateThumb(p.x, p.y);
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== p.id || input.locked) return;
      this.updateThumb(p.x, p.y);
    });

    const release = (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== p.id) return;
      this.pointerId = null;
      this.thumb.setPosition(this.origin.x, this.origin.y);
      input.clearVector();
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);

    bus.on('ui:action-context', ({ label }) => this.setContext(label));
    this.setContext(null);
  }

  private updateThumb(px: number, py: number): void {
    const dx = px - this.origin.x;
    const dy = py - this.origin.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, CFG.baseRadius);
    const ang = Math.atan2(dy, dx);
    this.thumb.setPosition(this.origin.x + Math.cos(ang) * clamped, this.origin.y + Math.sin(ang) * clamped);
    if (dist < CFG.deadZone) input.clearVector();
    else input.setVector(dx / CFG.baseRadius, dy / CFG.baseRadius);
  }

  /** El botón cambia de icono según lo que haya cerca: hablar / levantar / cavar / entrar. */
  setContext(label: string | null): void {
    this.buttonLabel.setText(label ? label.toUpperCase() : '·');
    this.button.setAlpha(label ? 1 : 0.45);
  }

  destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
    this.button.destroy();
    this.buttonHit.destroy();
  }
}
