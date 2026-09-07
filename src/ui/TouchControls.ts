import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { input } from '@/util/input';

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
  private button: Phaser.GameObjects.DOMElement;
  private origin: Phaser.Math.Vector2;
  private pointerId: number | null = null;

  constructor(scene: Phaser.Scene) {
    const world = VIEW.world;
    const centerY = world.y + world.h / 2;
    // el botón va DEBAJO del joystick (no arriba): así el pulgar que ya está apoyado
    // en la base del joystick lo alcanza derecho hacia abajo, en vez de tener que
    // saltar a un botón "colgado" arriba, lejos de donde descansa la mano.
    const jx = CFG.anchorX;
    const jy = centerY - CFG.gap;
    this.origin = new Phaser.Math.Vector2(jx, jy);

    const bx = CFG.anchorX;
    const by = centerY + CFG.gap;

    // botón HTML real, no un círculo de Phaser con hit-area manual: en el celular
    // real ese círculo no respondía de forma confiable (mismo problema que ya se
    // resolvió en BootScene — ver ese commit). Un <button> lo maneja el navegador.
    this.button = scene.add.dom(
      bx,
      by,
      'button',
      `width:${CFG.buttonSize}px; height:${CFG.buttonSize}px; box-sizing:border-box; padding:0; margin:0; ` +
        `border-radius:50%; background:#2E464F; color:#EAE8E0; border:1px solid #7FB0B8; ` +
        'font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size:9px; text-align:center; ' +
        'cursor:pointer; -webkit-tap-highlight-color:transparent;',
    );
    const btnEl = this.button.node as HTMLButtonElement;
    btnEl.type = 'button';
    btnEl.textContent = '·';
    btnEl.addEventListener('click', () => {
      if (input.locked) return;
      input.pressAction();
    });
    this.button.setDepth(52).setAlpha(0.5);

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
    (this.button.node as HTMLButtonElement).textContent = label ? label.toUpperCase() : '·';
    this.button.setAlpha(label ? 1 : 0.45);
  }

  destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
    this.button.destroy();
  }
}
