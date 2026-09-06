import { VIEW } from '@/config';

export const T = VIEW.tile;

export const toPx = (tile: number): number => tile * T;
export const toTile = (px: number): number => Math.floor(px / T);
/** Centro del tile, que es donde se paran los sprites. */
export const tileCenter = (tile: number): number => tile * T + T / 2;

export function inRect(x: number, y: number, r: readonly [number, number, number, number]): boolean {
  return x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
}
