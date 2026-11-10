import Phaser from 'phaser';
import { INPUT_GUARD, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import { sfx } from '@/audio/Sfx';
import { RETRO_FONT } from '@/util/text';

type Tab = 'diario' | 'codice';

interface JournalData {
  tab?: Tab;
  /** escenas a pausar mientras está abierta y a reanudar al cerrar (World/Ui en el juego) */
  pause?: string[];
}

/**
 * La libreta de Berwyn: Diario y Códice, a pantalla completa (GDD §8: los paneles
 * completos no son ventanas). Todo en HTML (texto nítido y con scroll nativo), con
 * el mismo lenguaje que la portada: vidrio oscuro, filete dorado, rombo rojo.
 * Lee de JournalSystem; no escribe nada.
 */
export class JournalScene extends Phaser.Scene {
  private root: Phaser.GameObjects.DOMElement | null = null;
  private tab: Tab = 'diario';
  private paused: string[] = [];

  constructor() {
    super('Journal');
  }

  init(data: JournalData): void {
    this.tab = data.tab ?? 'diario';
    this.paused = data.pause ?? [];
  }

  create(): void {
    this.scene.bringToTop();
    for (const k of this.paused) this.scene.pause(k);
    if (this.paused.length) bus.emit('ui:hud-visible', { visible: false });
    sfx.whoosh();

    const font = RETRO_FONT.replace(/"/g, "'");
    this.root = this.add
      .dom(0, 0, 'div', `width:${VIEW.width}px; height:${VIEW.height}px;`)
      .setOrigin(0, 0)
      .setDepth(10);
    const el = this.root.node as HTMLDivElement;
    el.innerHTML = `
      <div style="box-sizing:border-box; width:${VIEW.width}px; height:${VIEW.height}px; display:flex; flex-direction:column;
        font-family:${font}; color:#EAE8E0; background:linear-gradient(#24363B, #0E1416);
        border:1px solid rgba(217,168,69,0.5); animation: jr-in .35s ease-out both;">
        <style>
          @keyframes jr-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
          .jr-tab { flex:1; height:22px; border-radius:0; font-family:${font}; font-size:8px; letter-spacing:1px; cursor:pointer;
            background:rgba(14,20,22,0.55); border:1px solid rgba(217,168,69,0.35); color:#BFD3D8; -webkit-tap-highlight-color:transparent; }
          .jr-tab.on { background:linear-gradient(rgba(46,70,79,0.9), rgba(24,38,42,0.9)); border-color:#D9A845; color:#D9A845; }
          .jr-body::-webkit-scrollbar { width:3px; } .jr-body::-webkit-scrollbar-thumb { background:rgba(217,168,69,0.5); }
          .jr-h { font-size:9px; color:#D9A845; margin:14px 0 8px; display:flex; align-items:center; gap:6px; }
          .jr-h::before { content:''; width:4px; height:4px; background:#9C3A24; transform:rotate(45deg); flex:none; }
          .jr-h::after { content:''; flex:1; height:1px; background:linear-gradient(to right, rgba(217,168,69,0.6), rgba(217,168,69,0)); }
          .jr-p { font-size:7px; line-height:1.9; margin:0 0 8px; }
          .jr-k { font-size:6px; line-height:1.8; color:#7FB0B8; letter-spacing:1px; margin:6px 0 3px; }
          .jr-empty { font-size:7px; line-height:1.9; color:#7FB0B8; margin-top:16px; text-align:center; }
        </style>
        <div style="padding:14px 12px 0; text-align:center;">
          <div style="font-size:10px; color:#D9A845; text-shadow:0 2px 0 rgba(0,0,0,0.6); white-space:nowrap;">
            <span style="display:inline-block; width:14px; height:1px; vertical-align:middle; background:linear-gradient(to left, #D9A845, rgba(217,168,69,0));"></span>
            <span style="display:inline-block; width:3px; height:3px; margin:0 6px; vertical-align:middle; background:#9C3A24; transform:rotate(45deg);"></span>
            <span style="vertical-align:middle;">Libreta de Berwyn</span>
            <span style="display:inline-block; width:3px; height:3px; margin:0 6px; vertical-align:middle; background:#9C3A24; transform:rotate(45deg);"></span>
            <span style="display:inline-block; width:14px; height:1px; vertical-align:middle; background:linear-gradient(to right, #D9A845, rgba(217,168,69,0));"></span>
          </div>
          <div style="display:flex; gap:6px; margin-top:12px;">
            <button class="jr-tab" data-tab="diario" type="button">Diario</button>
            <button class="jr-tab" data-tab="codice" type="button">Códice</button>
          </div>
        </div>
        <div class="jr-body" style="flex:1; overflow-y:auto; padding:2px 14px 10px; margin:8px 0 0; -webkit-overflow-scrolling:touch;"></div>
        <div style="padding:8px 12px 12px; border-top:1px solid rgba(217,168,69,0.2); display:flex; justify-content:center;">
          <button class="jr-tab jr-close" type="button" style="flex:none; width:120px;">Cerrar</button>
        </div>
      </div>`;

    const shownAt = performance.now();
    const ready = (): boolean => performance.now() - shownAt >= INPUT_GUARD.buttonMs;
    el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!ready()) return;
        sfx.select();
        this.show(b.dataset.tab as Tab);
      }),
    );
    el.querySelector<HTMLButtonElement>('.jr-close')!.addEventListener('click', () => {
      if (ready()) this.close();
    });

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', () => this.close());
    kb?.on('keydown-SPACE', () => ready() && this.close());
    kb?.on('keydown-LEFT', () => this.show('diario'));
    kb?.on('keydown-RIGHT', () => this.show('codice'));
    kb?.on('keydown-D', () => this.show('diario'));
    kb?.on('keydown-C', () => this.show('codice'));
    const body = (): HTMLElement => el.querySelector('.jr-body') as HTMLElement;
    kb?.on('keydown-UP', () => body().scrollBy({ top: -40, behavior: 'smooth' }));
    kb?.on('keydown-DOWN', () => body().scrollBy({ top: 40, behavior: 'smooth' }));

    this.show(this.tab);
  }

  private show(tab: Tab): void {
    this.tab = tab;
    const el = this.root?.node as HTMLDivElement | undefined;
    if (!el) return;
    el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const body = el.querySelector('.jr-body') as HTMLElement;
    body.innerHTML = tab === 'diario' ? this.diarioHtml() : this.codiceHtml();
    body.scrollTop = 0;
  }

  private diarioHtml(): string {
    const entries = game.journal.entries();
    if (!entries.length) return '<div class="jr-empty">Todavía no hay nada escrito.</div>';
    const name = esc(game.state.player.name);
    return (
      `<div class="jr-k" style="margin-top:10px;">Escrito por ${name}</div>` +
      entries
        .map((e) => `<div class="jr-h">${esc(e.title)}</div>` + e.lines.map((l) => `<p class="jr-p">${esc(l)}</p>`).join(''))
        .join('')
    );
  }

  private codiceHtml(): string {
    const items = game.journal.codex();
    const total = registry.codex.length;
    return (
      `<div class="jr-k" style="margin-top:10px;">${items.length} de ${total} fichas. Cada una separa lo documentado de lo que el juego inventa.</div>` +
      items
        .map(
          (c) =>
            `<div class="jr-h">${esc(c.title)}</div>` +
            `<div class="jr-k">LO DOCUMENTADO</div><p class="jr-p">${esc(c.documented)}</p>` +
            `<div class="jr-k">LO DRAMATIZADO</div><p class="jr-p" style="color:#BFD3D8;">${esc(c.dramatized)}</p>`,
        )
        .join('')
    );
  }

  private close(): void {
    sfx.select();
    for (const k of this.paused) this.scene.resume(k);
    if (this.paused.length) bus.emit('ui:hud-visible', { visible: true });
    this.scene.stop();
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
