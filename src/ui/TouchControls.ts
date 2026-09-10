import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { input } from '@/util/input';

const CFG = {
  baseRadius: 20,
  thumbRadius: 9,
  deadZone: 4,
  // margen contra los bordes del mundo: el joystick aparece donde tocás, pero el
  // CENTRO se ajusta hacia adentro lo justo para que el círculo entero (y el
  // recorrido del pulgar, hasta baseRadius de distancia) quede siempre visible y
  // jugable, aunque el dedo haya tocado pegado al borde de la franja del mundo.
  edgeMargin: 4,
  // margen derecho compartido con el botón: acá se alinean los dos. 20, no 8: con 8
  // el punto más lejano al que llega la palanca quedaba pegado al borde físico de
  // la pantalla — en un celular real el dedo se salía del vidrio al empujar del
  // todo hacia la derecha.
  rightEdge: VIEW.width - 20,
  btnAboveTray: 26, // centro del botón, medido hacia arriba desde el borde de la bandeja
};

/**
 * Joystick flotante + botón de acción, los dos sobre el mapa (no en la bandeja). El
 * botón queda fijo pegado al margen derecho, siempre en el mismo lugar (ahí es
 * donde el pulgar espera encontrarlo). El joystick, en cambio, no tiene una base
 * fija: aparece recién al tocar, centrado donde cayó el dedo dentro del mundo, y
 * desaparece del todo al soltar — así nunca hay que estirar el pulgar hasta un
 * punto prefijado de la pantalla para poder moverse.
 */
export class TouchControls {
  private base: Phaser.GameObjects.Arc;
  private thumb: Phaser.GameObjects.Arc;
  private button: Phaser.GameObjects.DOMElement;
  private origin = new Phaser.Math.Vector2();
  private pointerId: number | null = null;
  private enabled = true;
  /** Si hay algo cerca para hacer (label != null) — el botón, HTML aparte del
   * canvas, solo se muestra cuando de verdad hay una acción. Antes se quedaba
   * siempre visible como un punto "·" sin función, un círculo sin nada que
   * explique qué es cuando no hay nada cerca. */
  private contextLabel: string | null = null;

  constructor(scene: Phaser.Scene) {
    const by = VIEW.tray.y - CFG.btnAboveTray;

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
    // Arranca oculto (setContext(null) al final del constructor lo confirma): sin
    // nada cerca no hay botón que mostrar, no un punto "·" sin función.
    this.button.setText('·').setDepth(52).setVisible(false);

    // el joystick arranca invisible: sin toque activo no hay nada que mostrar —
    // recién se posiciona y se muestra en el pointerdown, ver más abajo.
    this.base = scene.add.circle(0, 0, CFG.baseRadius, PAL.bone, 0.16).setDepth(50).setStrokeStyle(1, PAL.bone, 0.3).setVisible(false);
    this.thumb = scene.add.circle(0, 0, CFG.thumbRadius, PAL.bone, 0.45).setDepth(51).setVisible(false);

    // sin hit-area fija: cualquier toque dentro de la franja del mundo (no el HUD,
    // no la bandeja) arranca el joystick ahí mismo. Un solo dedo a la vez — si ya
    // hay uno arrastrando, un segundo toque (ej. la otra mano en el botón) no lo
    // reemplaza ni lo pelea.
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled || input.locked || this.pointerId !== null) return;
      if (!this.inWorldBand(p.x, p.y)) return;
      this.pointerId = p.id;
      this.origin.set(this.clampX(p.x), this.clampY(p.y));
      this.base.setPosition(this.origin.x, this.origin.y).setVisible(true);
      this.thumb.setPosition(this.origin.x, this.origin.y).setVisible(true);
      this.updateThumb(p.x, p.y);
    });

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== p.id || input.locked) return;
      this.updateThumb(p.x, p.y);
    });

    const release = (p: Phaser.Input.Pointer): void => {
      if (this.pointerId !== p.id) return;
      this.pointerId = null;
      this.base.setVisible(false);
      this.thumb.setVisible(false);
      input.clearVector();
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);

    bus.on('ui:action-context', ({ label }) => this.setContext(label));
    this.setContext(null);
  }

  /** Franja del mundo (GDD R4): ni el HUD de arriba ni la bandeja de abajo arrancan
   * el joystick — ahí van otros controles/lecturas, no movimiento. */
  private inWorldBand(x: number, y: number): boolean {
    const w = VIEW.world;
    return x >= 0 && x <= VIEW.width && y >= w.y && y <= w.y + w.h;
  }

  private clampX(x: number): number {
    return Phaser.Math.Clamp(x, CFG.baseRadius + CFG.edgeMargin, VIEW.width - CFG.baseRadius - CFG.edgeMargin);
  }

  private clampY(y: number): number {
    const w = VIEW.world;
    return Phaser.Math.Clamp(y, w.y + CFG.baseRadius + CFG.edgeMargin, w.y + w.h - CFG.baseRadius - CFG.edgeMargin);
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

  /** El botón cambia de texto según lo que haya cerca: hablar / levantar / cavar /
   * entrar — y solo se muestra cuando hay algo que hacer, ver refreshButton(). */
  setContext(label: string | null): void {
    this.contextLabel = label;
    if (label) this.button.setText(label.toUpperCase());
    this.refreshButton();
  }

  private refreshButton(): void {
    this.button.setVisible(this.enabled && this.contextLabel !== null);
  }

  /** Diálogos, cutscenes y overlays de pantalla completa se dibujan en el canvas y
   * pueden quedar "debajo" de cualquier profundidad — pero el botón es un elemento
   * HTML aparte, SIEMPRE por encima del canvas sin importar el depth de Phaser. Sin
   * ocultarlo a mano acá, quedaba flotando arriba de cualquier pantalla modal.
   * `enabled` en false además apaga el joystick: no arranca uno nuevo con un
   * toque perdido mientras hay un diálogo bloqueando el juego. */
  setVisible(visible: boolean): void {
    this.enabled = visible;
    this.refreshButton();
    if (!visible) {
      this.base.setVisible(false);
      this.thumb.setVisible(false);
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
