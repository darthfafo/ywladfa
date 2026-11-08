import Phaser from 'phaser';
import { PAL } from '@/config';

/**
 * Panel con volumen para toda la UI (HUD, bandeja, diálogo, decisiones): en vez
 * de un rectángulo plano con una línea de borde, un degradé con luz arriba,
 * canto claro arriba/izquierda y sombra abajo/derecha, un filete dorado
 * interior y cuatro remaches en las esquinas — como una placa de madera y
 * bronce. Mismo lenguaje en toda la UI, mismos colores de PAL.
 */
export interface PanelOpts {
  /** color de arriba y de abajo del degradé */
  top?: number;
  bottom?: number;
  alpha?: number;
  /** filete dorado interior + remaches */
  trim?: boolean;
  /** sombra proyectada hacia afuera (hacia arriba, para la bandeja; hacia abajo, para el HUD) */
  dropShadow?: 'up' | 'down' | 'around' | null;
}

export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: PanelOpts = {}): void {
  const top = o.top ?? PAL.ink2;
  const bottom = o.bottom ?? PAL.void;
  const a = o.alpha ?? 1;

  // sombra proyectada: un degradé que se desvanece hacia afuera
  const S = 10;
  if (o.dropShadow === 'up' || o.dropShadow === 'around') g.fillGradientStyle(PAL.void, PAL.void, PAL.void, PAL.void, 0, 0, 0.55, 0.55).fillRect(x, y - S, w, S);
  if (o.dropShadow === 'down' || o.dropShadow === 'around')
    g.fillGradientStyle(PAL.void, PAL.void, PAL.void, PAL.void, 0.55, 0.55, 0, 0).fillRect(x, y + h, w, S);

  // cuerpo: degradé vertical, más claro arriba (la luz viene de arriba)
  g.fillGradientStyle(top, top, bottom, bottom, a, a, a, a).fillRect(x, y, w, h);

  // cantos: claro arriba/izquierda, oscuro abajo/derecha → relieve
  g.fillStyle(PAL.seaPale, 0.35 * a).fillRect(x, y, w, 1);
  g.fillStyle(PAL.seaPale, 0.15 * a).fillRect(x, y, 1, h);
  g.fillStyle(PAL.void, 0.9 * a).fillRect(x, y + h - 1, w, 1);
  g.fillStyle(PAL.void, 0.6 * a).fillRect(x + w - 1, y, 1, h);

  if (o.trim) {
    // filete dorado interior, partido en dos tonos para que se lea como metal
    g.lineStyle(1, PAL.wheat, 0.45 * a).strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
    g.lineStyle(1, PAL.void, 0.5 * a).strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    // remaches
    for (const [rx, ry] of [
      [x + 2, y + 2],
      [x + w - 4, y + 2],
      [x + 2, y + h - 4],
      [x + w - 4, y + h - 4],
    ] as const) {
      g.fillStyle(PAL.wheat, 0.9 * a).fillRect(rx, ry, 2, 2);
      g.fillStyle(PAL.bone, 0.8 * a).fillRect(rx, ry, 1, 1);
    }
  }
}

export function addPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PanelOpts = {}): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  drawPanel(g, x, y, w, h, o);
  return g;
}

/** Marco con volumen para un retrato: hundido (sombra adentro arriba, luz abajo) con filete dorado. */
export function addInsetFrame(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(PAL.void, 1).fillRect(x - 2, y - 2, w + 4, h + 4);
  g.lineStyle(1, PAL.wheat, 0.6).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  g.fillStyle(PAL.seaPale, 0.25).fillRect(x - 2, y + h + 1, w + 4, 1);
  return g;
}

/** Estilo CSS de botón con volumen (para los <button> HTML de la UI). */
export const BUTTON_3D_CSS =
  'background: linear-gradient(to bottom, #3A5560 0%, #24363B 55%, #18262A 100%); ' +
  'border:1px solid #7FB0B8; border-radius:2px; ' +
  'box-shadow: inset 0 1px 0 rgba(191,211,216,0.35), inset 0 -2px 0 rgba(14,20,22,0.6), 0 2px 0 rgba(14,20,22,0.8); ' +
  'text-shadow: 0 1px 0 #0E1416;';
export const BUTTON_3D_ACTIVE_CSS =
  'background: linear-gradient(to bottom, #E6BD62 0%, #D9A845 55%, #A9791F 100%); ' +
  'border:1px solid #F2E2B0; color:#18262A; text-shadow:none; ' +
  'box-shadow: inset 0 1px 0 rgba(255,245,220,0.6), inset 0 -2px 0 rgba(90,60,20,0.5), 0 2px 0 rgba(14,20,22,0.8);';
