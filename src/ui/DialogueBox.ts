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
    if (this.current?.choices.length) return; // con opciones se avanza eligiendo
    this.show(this.sys.next());
  }

  private show(line: RenderedLine | null): void {
    this.clearChoices();
    this.current = line;

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
    this.bodyText.setText(line.text);

    if (line.choices.length) {
      this.hint.setVisible(false);
      this.renderChoices(line);
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
   * Arriba/abajo + espacio elige entre ellas (con el mismo cursor "›" que se usa en
   * el resto del juego) además del tap/click — GDD §8, "las dos entradas activas". */
  private renderChoices(line: RenderedLine): void {
    this.bodyText.setVisible(false);
    this.nameText.setVisible(true);

    // gap y padding chicos a propósito: con 3 opciones y alguna larga (wordWrap a 2
    // líneas), el bloque tiene que entrar en los ~70px que quedan de bandeja debajo
    // del nombre — de sobra se corta contra el borde de abajo. Depth por encima del
    // tapCatcher (1): si no, el tap para "avanzar" de la bandeja tapa los botones.
    const wrap = this.scene.add
      .dom(70, 26, 'div', `display:flex; flex-direction:column; gap:3px; width:${TRAY.w - 80}px;`)
      .setOrigin(0, 0)
      .setDepth(10);
    this.root.add(wrap);
    this.choicesEl = wrap;
    const container = wrap.node as HTMLDivElement;

    const buttons: HTMLButtonElement[] = [];
    let focused = 0;
    const paint = (): void => {
      buttons.forEach((b, i) => {
        const on = i === focused;
        b.style.color = on ? '#D9A845' : '#BFD3D8';
        b.textContent = (on ? '› ' : '  ') + line.choices[i]!.text;
      });
    };
    const pick = (i: number): void => {
      bus.emit('ui:toast', { text: '' });
      this.show(this.sys.choose(line.choices[i]!.id));
    };

    line.choices.forEach((_c, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText =
        'display:block; width:100%; background:transparent; border:none; margin:0; padding:2px 0; ' +
        'text-align:left; color:#BFD3D8; font-family: ui-monospace, "SF Mono", Menlo, monospace; ' +
        'font-size:11px; line-height:1.15; cursor:pointer; -webkit-tap-highlight-color:transparent;';
      btn.addEventListener('click', () => pick(i));
      btn.addEventListener(
        'touchstart',
        () => {
          focused = i;
          paint();
        },
        { passive: true },
      );
      buttons.push(btn);
      container.appendChild(btn);
    });
    paint();

    const kb = this.scene.input.keyboard;
    const onDown = (): void => {
      focused = Math.min(focused + 1, buttons.length - 1);
      paint();
    };
    const onUp = (): void => {
      focused = Math.max(focused - 1, 0);
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
  }

  private clearChoices(): void {
    this.choicesKeyCleanup?.();
    this.choicesKeyCleanup = null;
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
