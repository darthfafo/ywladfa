import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { input } from '@/util/input';

const CFG = {
  baseRadius: 20,
  thumbRadius: 9,
  deadZone: 4,
  grabRadius: 30, // zona de agarre más generosa que el círculo visual del joystick
  // margen derecho compartido: acá se alinean joystick y botón. 20, no 8: con 8 el
  // punto más lejano al que llega la palanca (rightEdge) quedaba pegado al borde
  // físico de la pantalla — en un celular real el dedo se salía del vidrio al
  // empujar del todo hacia la derecha.
  rightEdge: VIEW.width - 20,
  btnAboveTray: 26, // centro del botón, medido hacia arriba desde el borde de la bandeja
  joyAboveBtn: 60, // separación entre el centro del joystick y el del botón
};

/**
 * Joystick fijo + botón de acción, los dos sobre el mapa (no en la bandeja), pegados
 * al margen derecho — ahí es donde suele estar el pulgar sosteniendo el celular. El
 * joystick arriba, el botón abajo (pegado al borde de la bandeja de diálogo): así el
 * pulgar baja del joystick al botón en línea recta, sin "saltar" a otro lado.
 */
export class TouchControls {
  private base: Phaser.GameObjects.Arc;
  private thumb: Phaser.GameObjects.Arc;
  private button: Phaser.GameObjects.DOMElement;
  private origin: Phaser.Math.Vector2;
  private pointerId: number | null = null;

  constructor(scene: Phaser.Scene) {
    const by = VIEW.tray.y - CFG.btnAboveTray;
    const jy = by - CFG.joyAboveBtn;
    const jx = CFG.rightEdge - CFG.baseRadius;
    this.origin = new Phaser.Math.Vector2(jx, jy);

    // botón HTML real, no un círculo de Phaser con hit-area manual: en el celular
    // real ese círculo no respondía de forma confiable (mismo problema que ya se
    // resolvió en BootScene — ver ese commit). Un <button> lo maneja el navegador.
    // Píldora, no círculo fijo: "Levantar"/"Hablar" no entran en un círculo de 40px
    // sin desbordarlo (se veía mal incluso en desktop) — el ancho crece con el texto.
    // Origen (1, 0.5): el punto fijo es el borde DERECHO, no el centro — así una
    // palabra larga crece hacia la izquierda y nunca se corta contra el borde del
    // canvas (le pasaba con "Levantar" centrado en un x fijo).
    this.button = scene.add
      .dom(
        CFG.rightEdge,
        by,
        'button',
        'height:24px; box-sizing:border-box; margin:0; padding:0 10px; min-width:24px; ' +
          'display:inline-flex; align-items:center; justify-content:center; white-space:nowrap; ' +
          'border-radius:12px; background:#2E464F; color:#EAE8E0; border:1px solid #7FB0B8; ' +
          'font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size:10px; text-align:center; ' +
          'cursor:pointer; -webkit-tap-highlight-color:transparent;',
      )
      .setOrigin(1, 0.5);
    const btnEl = this.button.node as HTMLButtonElement;
    btnEl.type = 'button';
    btnEl.addEventListener('click', () => {
      if (input.locked) return;
      input.pressAction();
    });
    // setText(), no node.textContent directo: el origen (1, 0.5) necesita que Phaser
    // sepa el ancho ACTUAL del botón para calcular el offset del borde derecho, y solo
    // lo recalcula (updateSize()) cuando el texto cambia a través de su propio método.
    this.button.setText('·').setDepth(52).setAlpha(0.5);

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
    this.button.setText(label ? label.toUpperCase() : '·');
    this.button.setAlpha(label ? 1 : 0.45);
  }

  /** Diálogos, cutscenes y overlays de pantalla completa se dibujan en el canvas y
   * pueden quedar "debajo" de cualquier profundidad — pero el botón es un elemento
   * HTML aparte, SIEMPRE por encima del canvas sin importar el depth de Phaser. Sin
   * ocultarlo a mano acá, quedaba flotando arriba de cualquier pantalla modal. */
  setVisible(visible: boolean): void {
    this.base.setVisible(visible);
    this.thumb.setVisible(visible);
    this.button.setVisible(visible);
    if (!visible) {
      this.pointerId = null;
      input.clearVector();
    }
  }

  destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
    this.button.destroy();
  }
}
