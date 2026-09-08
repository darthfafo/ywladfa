import Phaser from 'phaser';
import { PAL, VIEW } from '@/config';
import { bus } from '@/core/EventBus';
import { game } from '@/core/Game';
import { registry } from '@/core/Registry';
import { DialogueSystem, type RenderedLine } from '@/systems/DialogueSystem';
import { portraitIdForSpeaker, portraitTextureKey } from '@/util/assets';
import { input } from '@/util/input';
import { crisp, FONT, FONT_FAMILY } from '@/util/text';

const TRAY = VIEW.tray;

/**
 * Ocupa la MISMA franja inferior que los controles: no aparece ni desaparece nada,
 * solo cambia el contenido (GDD §8). En 9:16 eso es lo que mantiene el mundo intacto.
 */
export class DialogueBox {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private portrait: Phaser.GameObjects.Rectangle;
  private portraitImg: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private tapCatcher: Phaser.GameObjects.DOMElement;
  private choicesEl: Phaser.GameObjects.DOMElement | null = null;
  private choicesKeyCleanup: (() => void) | null = null;
  /** Si las opciones no entran en una sola página, avanza a la siguiente — ver
   * renderChoices(). null cuando no hay más páginas (o no hay opciones). */
  private choicesAdvancePage: (() => void) | null = null;
  /** Texto del NODO ACTUAL que todavía no se mostró — ver setBodyTextPaginated().
   * null cuando ya se ve todo lo que tiene ese nodo. */
  private pendingText: string | null = null;
  private sys: DialogueSystem;
  private current: RenderedLine | null = null;
  private onClose: (() => void) | null = null;

  constructor(private scene: Phaser.Scene) {
    this.sys = new DialogueSystem(game);

    // opaco del todo, no 0.97: contra una cutscene con foto de fondo (BootScene,
    // cold_open) ese resto de transparencia bajaba el contraste del texto.
    this.bg = scene.add.rectangle(0, 0, TRAY.w, TRAY.h, PAL.ink, 1).setOrigin(0, 0);
    // línea sola arriba, no un marco de los 4 lados: es el mismo contenedor que la
    // bandeja vacía (UiScene.buildTray) y el HUD (borde solo en el filo compartido
    // con el mundo) — un stroke completo le agregaba a esto un borde a la derecha
    // que ningún otro panel del juego tiene, se notaba distinto en las cutscenes.
    const topBorder = scene.add.rectangle(0, 0, TRAY.w, 1, PAL.slate).setOrigin(0, 0);
    // el borde importa sobre todo cuando hay arte real: el relleno pasa a PAL.ink
    // (ver show()), el mismo color que el fondo de la bandeja — sin borde el
    // recuadro queda invisible, sin contraste contra lo que lo rodea. PAL.bone a
    // baja opacidad, no el celeste que se sacó de las imágenes: mismo tono ya usado
    // para el joystick (sutil, neutro) y suficientemente claro para no fundirse con
    // ningún color de relleno posible (ink/slate/clayDark/moss).
    this.portrait = scene.add.rectangle(8, 12, 48, 48, PAL.slate).setOrigin(0, 0).setStrokeStyle(1, PAL.bone, 0.35);
    // placeholder de color mientras no haya PNG real para ese personaje/expresión
    // (src/util/assets.ts decide en show() cuál de los dos se ve).
    this.portraitImg = scene.add.image(8, 12, '__DEFAULT').setOrigin(0, 0).setVisible(false);
    // el nombre arranca a la misma altura (12) que el recuadro de retrato — antes
    // estaba unos px más arriba (7) y quedaba desalineado con el borde de la foto.
    // x=70, no 64: un poco más de aire entre el retrato y el texto (mismo x que ya
    // usan las opciones de diálogo más abajo, ver renderChoices).
    this.nameText = crisp(
      scene.add
        .text(70, 12, '', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#D9A845' })
        .setResolution(4),
    );
    this.bodyText = crisp(
      scene.add
        .text(70, 26, '', {
          fontFamily: FONT_FAMILY,
          fontSize: FONT.body,
          color: '#EAE8E0',
          wordWrap: { width: TRAY.w - 80 },
          lineSpacing: 4,
        })
        .setResolution(4),
    );
    this.hint = crisp(
      scene.add
        .text(TRAY.w - 8, TRAY.h - 13, '▼', { fontFamily: FONT_FAMILY, fontSize: FONT.body, color: '#7FB0B8' })
        .setOrigin(1, 0)
        .setResolution(4),
    );
    // toque para avanzar de línea: HTML real, no un rectángulo de Phaser con
    // setInteractive/pointerdown — era el único lugar de todo el diálogo que
    // seguía con ese mecanismo, y es probablemente donde se colgaba en el celular
    // real (mismo problema ya resuelto en botones y opciones). Phaser oculta a los
    // elementos DOM hijos de un container automáticamente cuando ese container no
    // es visible (willRender()), así que no hace falta togglear nada a mano.
    this.tapCatcher = scene.add
      .dom(0, 0, 'div', `width:${TRAY.w}px; height:${TRAY.h}px; cursor:pointer;`)
      .setOrigin(0, 0)
      .setDepth(1);
    (this.tapCatcher.node as HTMLDivElement).addEventListener('click', () => this.advance());

    this.root = scene.add
      .container(TRAY.x, TRAY.y, [
        this.bg,
        topBorder,
        this.tapCatcher,
        this.portrait,
        this.portraitImg,
        this.nameText,
        this.bodyText,
        this.hint,
      ])
      .setDepth(80)
      .setVisible(false);

    scene.input.keyboard?.on('keydown-SPACE', () => this.advance());
    scene.input.keyboard?.on('keydown-E', () => this.advance());
  }

  get active(): boolean {
    return this.root.visible;
  }

  start(dialogueId: string, onClose?: () => void): void {
    this.onClose = onClose ?? null;
    input.locked = true;
    this.root.setVisible(true);
    this.show(this.sys.start(dialogueId));
  }

  /** Línea corta de un NPC sin diálogo definido en /data (ej. "— Ahora no."). Va en
   * la misma bandeja que cualquier línea real, no como toast flotante — es lo que
   * dice el personaje, tiene que leerse en el mismo lugar que el resto de lo que
   * dice. No pasa por DialogueSystem (no hay nodos ni elecciones que resolver): se
   * cierra con el mismo toque/tecla de siempre porque sys.next() sin diálogo activo
   * ya devuelve null de por sí. */
  refuse(npcId: string, onClose?: () => void, text = '— Ahora no.'): void {
    this.onClose = onClose ?? null;
    input.locked = true;
    this.root.setVisible(true);
    this.show({
      nodeId: '__refuse',
      speakerId: npcId,
      speakerName: registry.npc(npcId).name,
      text,
      portrait: 'neutral',
      choices: [],
      isNarrator: false,
    });
  }

  private advance(): void {
    if (!this.active) return;
    if (this.pendingText) {
      // el propio nodo todavía tiene texto sin mostrar (ver setBodyTextPaginated):
      // sigue paginando ANTES de pasar al siguiente nodo o mostrar sus opciones.
      this.setBodyTextPaginated(this.pendingText);
      this.updateTail();
      return;
    }
    if (this.current?.choices.length) {
      // con opciones, tocar la bandeja no cierra nada: si no entraban todas en
      // una página, pasa a la siguiente (ver renderChoices) — si ya se ven
      // todas, no hace nada, se elige tocando una opción.
      this.choicesAdvancePage?.();
      return;
    }
    this.show(this.sys.next());
  }

  private show(line: RenderedLine | null): void {
    this.clearChoices();
    this.current = line;
    this.pendingText = null;

    if (!line) {
      this.root.setVisible(false);
      input.locked = false;
      const cb = this.onClose;
      this.onClose = null;
      cb?.();
      return;
    }

    // con opciones, el nodo sigue teniendo como `speaker` a quien preguntó (ej. Edwyn),
    // pero lo que se muestra abajo son las respuestas del jugador — sin este cambio
    // quedaba el nombre/retrato del NPC encabezando lo que decía el propio jugador.
    const hasChoices = line.choices.length > 0;
    const speakerId = hasChoices ? 'pc' : line.speakerId;
    const speakerName = hasChoices ? game.state.player.name : line.speakerName;
    this.nameText.setText(line.isNarrator ? '' : speakerName);
    const portraitId = line.isNarrator ? null : portraitIdForSpeaker(speakerId, game.state.player.gender);
    const key = portraitId ? portraitTextureKey(portraitId, line.portrait) : null;
    const hasArt = !!key && this.scene.textures.exists(key);
    // el recuadro de fondo se ve SIEMPRE que hay retrato, con o sin arte real: sin
    // esto, el retrato pintado quedaba flotando suelto sobre el fondo de la bandeja,
    // sin ningún borde/caja que lo contenga (a diferencia del placeholder de color,
    // que siempre se sintió "encajado" por ser él mismo un rectángulo sólido).
    this.portrait.setVisible(!line.isNarrator);
    this.portrait.setFillStyle(hasArt ? PAL.ink : portraitColor(line.portrait));
    this.portraitImg.setVisible(hasArt);
    if (hasArt) {
      // el archivo puede venir a cualquier resolución (se pide más grande que 48x48
      // para no perder nitidez al bajar de tamaño, ver docs/05-prompts-arte.txt §1):
      // siempre se muestra a 48x48 acá adentro, sea cual sea el tamaño nativo.
      this.portraitImg.setTexture(key!).setDisplaySize(48, 48);
      // son ilustraciones pintadas, no pixel art de bordes duros — con pixelArt:true
      // el filtro por default es NEAREST y queda dentado al reescalar (igual que los
      // fondos cinemáticos, ver addSceneBackground en util/assets.ts).
      this.portraitImg.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.bodyText.setPosition(line.isNarrator ? 10 : 70, line.isNarrator ? 14 : 26);
    this.bodyText.setWordWrapWidth(line.isNarrator ? TRAY.w - 20 : TRAY.w - 80);
    this.bodyText.setColor(line.isNarrator ? '#9BAEB4' : '#EAE8E0');
    this.setBodyTextPaginated(line.text);
    this.updateTail();
  }

  /** Pone `fullText` en `bodyText`; si no entra entero en lo que queda de bandeja
   * (mismo problema que ya se arregló en renderChoices — una línea larga se salía
   * del canvas, invisible), corta en el último espacio que sí entra y guarda el
   * resto en `pendingText` para la próxima página (ver advance()). */
  private setBodyTextPaginated(fullText: string): void {
    this.bodyText.setText(fullText);
    const maxH = TRAY.h - this.bodyText.y - 6;
    if (this.bodyText.height <= maxH) {
      this.pendingText = null;
      return;
    }
    const words = fullText.split(' ');
    let shown = '';
    for (const w of words) {
      const attempt = shown ? `${shown} ${w}` : w;
      this.bodyText.setText(attempt);
      if (this.bodyText.height > maxH) break;
      shown = attempt;
    }
    if (!shown) shown = words[0] ?? ''; // ni la primera palabra entraría — caso límite, mostrarla igual
    this.bodyText.setText(shown);
    this.pendingText = fullText.slice(shown.length).trim() || null;
  }

  /** Qué va debajo del cuerpo, ya mostrada (una página de) su texto: si el nodo
   * actual todavía tiene texto sin paginar, "▼" (seguir paginando, no elegir ni
   * pasar de nodo); si no, las opciones si las tiene, o "▼" para el siguiente nodo. */
  private updateTail(): void {
    if (this.pendingText) {
      this.hint.setVisible(true);
      return;
    }
    if (this.current?.choices.length) {
      this.hint.setVisible(false);
      this.renderChoices(this.current);
    } else {
      this.hint.setVisible(true);
    }
  }

  /** Opciones como botones HTML reales, no texto de Phaser con hit-area manual: en
   * el celular real no respondían de forma confiable (mismo problema ya resuelto en
   * BootScene/TouchControls), y un paso fijo entre opciones tampoco tenía en cuenta
   * cuántas líneas ocupaba una opción larga al hacer wordWrap — con esto ya no
   * importa: es un <div> flex en columna, el propio navegador apila cada botón
   * según lo que realmente ocupa el anterior.
   *
   * Paginado: si el bloque completo (3 opciones, alguna larga con wordWrap a 2-3
   * líneas) no entra en lo que queda de bandeja debajo del nombre, la última se
   * salía de la pantalla — invisible, sin scroll ni forma de leerla. Ahora se mide
   * la altura real ya con el texto puesto (offsetHeight, el navegador ya hizo el
   * wrap) y se separa en páginas: cada una entra completa, y "▼" (el mismo ícono de
   * "seguir" del resto del diálogo) indica que hay más — tocar la bandeja o llegar
   * al final con las flechas pasa de página en vez de no hacer nada.
   *
   * Arriba/abajo + espacio elige entre ellas (con el mismo cursor "›" que se usa en
   * el resto del juego) además del tap/click — GDD §8, "las dos entradas activas". */
  private renderChoices(line: RenderedLine): void {
    this.bodyText.setVisible(false);
    this.nameText.setVisible(true);

    // Depth por encima del tapCatcher (1): si no, el tap para "avanzar" de la
    // bandeja tapa los botones.
    const wrap = this.scene.add
      .dom(70, 26, 'div', `display:flex; flex-direction:column; gap:3px; width:${TRAY.w - 80}px;`)
      .setOrigin(0, 0)
      .setDepth(10);
    this.root.add(wrap);
    this.choicesEl = wrap;
    const container = wrap.node as HTMLDivElement;

    const pick = (i: number): void => {
      bus.emit('ui:toast', { text: '' });
      this.show(this.sys.choose(line.choices[i]!.id));
    };

    const buttons: HTMLButtonElement[] = line.choices.map((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText =
        'display:block; width:100%; background:transparent; border:none; margin:0; padding:2px 0; ' +
        'text-align:left; color:#BFD3D8; font-family: ui-monospace, "SF Mono", Menlo, monospace; ' +
        'font-size:11px; line-height:1.15; cursor:pointer; -webkit-tap-highlight-color:transparent;';
      btn.textContent = c.text; // contenido real puesto ya, para medir el wrap de verdad
      container.appendChild(btn);
      return btn;
    });

    // altura disponible: TRAY.h menos el nombre de arriba y un margen contra el
    // borde inferior de la bandeja (mismo espíritu que el resto de la UI, no
    // pegado al filo).
    const maxH = TRAY.h - 26 - 6;
    const GAP = 3;

    // una sola opción larga puede no entrar aunque esté SOLA en su página (el
    // paginado de abajo solo separa ENTRE opciones) — para esa achica la letra en
    // pasos hasta que entra, en vez de dejarla salirse del canvas sin que se note.
    for (const b of buttons) {
      let size = 11;
      while (b.offsetHeight > maxH && size > 8) {
        size -= 1;
        b.style.fontSize = `${size}px`;
      }
    }
    const pageStart = [0];
    let acc = 0;
    buttons.forEach((b, i) => {
      const h = b.offsetHeight + (i > pageStart[pageStart.length - 1]! ? GAP : 0);
      if (acc + h > maxH && i > pageStart[pageStart.length - 1]!) {
        pageStart.push(i);
        acc = 0;
      }
      acc += h;
    });

    let page = 0;
    let focused = 0;
    const pageEnd = (p: number): number => (pageStart[p + 1] ?? buttons.length) - 1;
    const paint = (): void => {
      const from = pageStart[page]!;
      const to = pageEnd(page);
      buttons.forEach((b, i) => {
        b.style.display = i >= from && i <= to ? 'block' : 'none';
        const on = i === focused;
        b.style.color = on ? '#D9A845' : '#BFD3D8';
        b.textContent = (on ? '› ' : '  ') + line.choices[i]!.text;
      });
      this.hint.setVisible(page < pageStart.length - 1);
    };
    const nextPage = (): void => {
      if (page >= pageStart.length - 1) return;
      page += 1;
      focused = pageStart[page]!;
      paint();
    };
    paint();
    this.choicesAdvancePage = pageStart.length > 1 ? nextPage : null;

    const kb = this.scene.input.keyboard;
    const onDown = (): void => {
      if (focused >= pageEnd(page)) {
        nextPage();
        return;
      }
      focused = Math.min(focused + 1, pageEnd(page));
      paint();
    };
    const onUp = (): void => {
      focused = Math.max(focused - 1, pageStart[page]!);
      paint();
    };
    const onSelect = (): void => pick(focused);
    kb?.on('keydown-DOWN', onDown);
    kb?.on('keydown-S', onDown);
    kb?.on('keydown-UP', onUp);
    kb?.on('keydown-W', onUp);
    kb?.on('keydown-SPACE', onSelect);
    kb?.on('keydown-E', onSelect);
    this.choicesKeyCleanup = () => {
      kb?.off('keydown-DOWN', onDown);
      kb?.off('keydown-S', onDown);
      kb?.off('keydown-UP', onUp);
      kb?.off('keydown-W', onUp);
      kb?.off('keydown-SPACE', onSelect);
      kb?.off('keydown-E', onSelect);
    };

    buttons.forEach((b, i) => {
      b.addEventListener('click', () => pick(i));
      b.addEventListener(
        'touchstart',
        () => {
          if (i < pageStart[page]! || i > pageEnd(page)) return;
          focused = i;
          paint();
        },
        { passive: true },
      );
    });
  }

  private clearChoices(): void {
    this.choicesKeyCleanup?.();
    this.choicesKeyCleanup = null;
    this.choicesAdvancePage = null;
    this.choicesEl?.destroy();
    this.choicesEl = null;
    this.bodyText.setVisible(true);
  }
}

function portraitColor(p: 'neutral' | 'tenso' | 'calido'): number {
  if (p === 'tenso') return PAL.clayDark;
  if (p === 'calido') return PAL.moss;
  return PAL.slate;
}
