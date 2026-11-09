import Phaser from 'phaser';
import { PAL } from '@/config';

/**
 * Panel de toda la UI (HUD, bandeja, diálogo, decisiones), con el mismo lenguaje
 * que la portada: vidrio oscuro plano, un filete dorado fino en el borde que da al
 * mundo, un rombo rojo al centro de ese borde y escuadras doradas en las esquinas
 * (antes: placa con volumen, cantos biselados y remaches — se veía tosca).
 */
export interface PanelOpts {
  /** color de arriba y de abajo del degradé */
  top?: number;
  bottom?: number;
  alpha?: number;
  /** filete interior + escuadras en las esquinas */
  trim?: boolean;
  /** de qué lado da al mundo: ahí va la sombra, el filete dorado y el rombo
   * ('up' = bandeja, 'down' = HUD, 'around' = tarjeta flotante) */
  dropShadow?: 'up' | 'down' | 'around' | null;
}

/** rombo chico relleno, centrado en (cx, cy) */
export function drawDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha).fillPoints(
    [
      new Phaser.Math.Vector2(cx, cy - r),
      new Phaser.Math.Vector2(cx + r, cy),
      new Phaser.Math.Vector2(cx, cy + r),
      new Phaser.Math.Vector2(cx - r, cy),
    ],
    true,
  );
}

/** filete dorado que se desvanece hacia los costados, con un rombo en el medio */
function drawRule(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, a: number): void {
  const cx = x + w / 2;
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const fade = 0.25 + 0.6 * (1 - t);
    const seg = w / 2 / steps;
    g.fillStyle(PAL.wheat, fade * a).fillRect(cx + i * seg, y, seg + 0.5, 1);
    g.fillStyle(PAL.wheat, fade * a).fillRect(cx - (i + 1) * seg, y, seg + 0.5, 1);
  }
  drawDiamond(g, cx, y + 0.5, 2.5, PAL.void, a);
  drawDiamond(g, cx, y + 0.5, 2, PAL.barranca, a);
}

export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: PanelOpts = {}): void {
  const top = o.top ?? PAL.ink2;
  const bottom = o.bottom ?? PAL.void;
  const a = o.alpha ?? 1;

  // sombra proyectada: un degradé que se desvanece hacia afuera
  const S = 8;
  if (o.dropShadow === 'up' || o.dropShadow === 'around') g.fillGradientStyle(PAL.void, PAL.void, PAL.void, PAL.void, 0, 0, 0.45, 0.45).fillRect(x, y - S, w, S);
  if (o.dropShadow === 'down' || o.dropShadow === 'around')
    g.fillGradientStyle(PAL.void, PAL.void, PAL.void, PAL.void, 0.45, 0.45, 0, 0).fillRect(x, y + h, w, S);

  // cuerpo: degradé vertical suave, sin biselado
  g.fillGradientStyle(top, top, bottom, bottom, a, a, a, a).fillRect(x, y, w, h);

  // el borde que da al mundo: filete dorado con rombo
  if (o.dropShadow === 'up') drawRule(g, x, y, w, a);
  else if (o.dropShadow === 'down') drawRule(g, x, y + h - 1, w, a);
  else if (o.dropShadow === 'around') {
    g.lineStyle(1, PAL.wheat, 0.55 * a).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    drawDiamond(g, x + w / 2, y + 0.5, 2.5, PAL.void, a);
    drawDiamond(g, x + w / 2, y + 0.5, 2, PAL.barranca, a);
  }

  if (o.trim) {
    // filete interior apenas visible + escuadras doradas en las esquinas
    g.lineStyle(1, PAL.wheat, 0.14 * a).strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    const L = 6;
    g.fillStyle(PAL.wheat, 0.75 * a);
    for (const [cx, cy, sx, sy] of [
      [x + 4, y + 4, 1, 1],
      [x + w - 5, y + 4, -1, 1],
      [x + 4, y + h - 5, 1, -1],
      [x + w - 5, y + h - 5, -1, -1],
    ] as const) {
      g.fillRect(sx > 0 ? cx : cx - L + 1, cy, L, 1);
      g.fillRect(cx, sy > 0 ? cy : cy - L + 1, 1, L);
    }
  }
}

export function addPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PanelOpts = {}): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  drawPanel(g, x, y, w, h, o);
  return g;
}

/** Marco de retrato: fondo oscuro con un filete dorado fino. */
export function addInsetFrame(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(PAL.void, 1).fillRect(x - 2, y - 2, w + 4, h + 4);
  g.lineStyle(1, PAL.wheat, 0.55).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  return g;
}

/** Botón de vidrio oscuro con filete dorado fino (el estilo de la portada). */
export const BUTTON_3D_CSS =
  'background: rgba(14,20,22,0.6); ' +
  'border:1px solid rgba(217,168,69,0.45); border-radius:0; ' +
  'box-shadow: 0 2px 8px rgba(0,0,0,0.35); ' +
  'text-shadow: 0 1px 0 #0E1416;';
/** La acción principal: mismo vidrio, filete y letra dorados, con un brillo suave. */
export const BUTTON_3D_ACTIVE_CSS =
  'background: linear-gradient(rgba(46,70,79,0.88), rgba(24,38,42,0.88)); ' +
  'border:1px solid #D9A845; color:#D9A845; text-shadow: 0 1px 0 #0E1416; ' +
  'box-shadow: 0 0 8px rgba(217,168,69,0.25), 0 2px 8px rgba(0,0,0,0.4);';
