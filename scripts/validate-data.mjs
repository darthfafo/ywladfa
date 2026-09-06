#!/usr/bin/env node
/**
 * Valida los JSON de /data e integridad referencial (regla R5).
 * Atrapa el 90 % de los bugs de contenido antes de abrir el navegador.
 * Uso: npm run validate:data
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'data');
const errs = [];
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
}

const files = walk(DATA);
const loaded = new Map();
for (const f of files) {
  try {
    loaded.set(relative(ROOT, f).replaceAll('\\', '/'), load(f));
  } catch (e) {
    errs.push(`JSON inválido ${relative(ROOT, f)}: ${e.message}`);
  }
}
if (errs.length) fail();

const npcs = new Set(loaded.get('data/npcs.json').npcs.map((n) => n.id));
const items = new Set(loaded.get('data/items.json').items.map((i) => i.id));
const bultos = loaded.get('data/items.json').bultos_nivel01;
const codex = new Set(loaded.get('data/codex.json').entries.map((c) => c.id));
const lvl = loaded.get('data/levels/nivel-01.json');
const dlg = loaded.get('data/dialogues/nivel-01.json');
const qst = loaded.get('data/quests/nivel-01.json');

const trigs = new Set(lvl.triggers.map((t) => t.id));
const zones = new Set(lvl.zones.map((z) => z.id));
const dlgIds = new Set(dlg.dialogues.map((d) => d.id));
const choiceIds = new Set(dlg.choices.map((c) => c.id));

for (const s of lvl.spawns.npcs) if (!npcs.has(s.id)) errs.push(`spawn npc inexistente: ${s.id}`);

for (const t of lvl.triggers) {
  if (t.zone && !zones.has(t.zone)) errs.push(`${t.id} → zona inexistente ${t.zone}`);
  const a = t.action ?? {};
  if (a.dialogue && !dlgIds.has(a.dialogue)) errs.push(`${t.id} → diálogo inexistente ${a.dialogue}`);
  if (a.choice && !choiceIds.has(a.choice)) errs.push(`${t.id} → choice inexistente ${a.choice}`);
  if (a.giveItem && !items.has(a.giveItem)) errs.push(`${t.id} → ítem inexistente ${a.giveItem}`);
  if (typeof t.turnCost !== 'number' || t.turnCost < 0 || t.turnCost > 4) errs.push(`${t.id} → turnCost fuera de rango`);
}

for (const q of qst.quests)
  for (const st of q.steps)
    if (st.trigger && !trigs.has(st.trigger)) errs.push(`${q.id}/${st.id} → trigger inexistente ${st.trigger}`);

for (const d of dlg.dialogues) {
  if (d.npc && !npcs.has(d.npc)) errs.push(`${d.id} → npc inexistente ${d.npc}`);
  if (!d.nodes[d.start]) errs.push(`${d.id} → nodo start inexistente ${d.start}`);
  for (const [nid, n] of Object.entries(d.nodes)) {
    if (n.speaker !== 'pc' && n.speaker !== 'narrator' && !npcs.has(n.speaker))
      errs.push(`${d.id}/${nid} → speaker desconocido ${n.speaker}`);
    if (n.next && !d.nodes[n.next]) errs.push(`${d.id}/${nid} → next inexistente ${n.next}`);
    const effects = [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.effects ?? [])];
    for (const e of effects) {
      if (e.giveItem && !items.has(e.giveItem)) errs.push(`${d.id}/${nid} → giveItem inexistente ${e.giveItem}`);
      if (e.codex && !codex.has(e.codex)) errs.push(`${d.id}/${nid} → codex inexistente ${e.codex}`);
      if (e.bond && !npcs.has(e.bond.npc)) errs.push(`${d.id}/${nid} → bond npc inexistente ${e.bond.npc}`);
    }
    for (const c of n.choices ?? []) if (c.next && !d.nodes[c.next]) errs.push(`${d.id}/${nid}/${c.id} → next inexistente ${c.next}`);
  }
}

for (const c of loaded.get('data/codex.json').entries)
  if (!c.documented || !c.dramatized) errs.push(`codex ${c.id} sin documented/dramatized`);

if (bultos.length !== 8) errs.push(`se esperaban 8 bultos, hay ${bultos.length}`);

// geometría: todo spawn dentro de alguna zona
const inZone = (x, y) =>
  lvl.zones.some((z) => x >= z.rect[0] && x < z.rect[0] + z.rect[2] && y >= z.rect[1] && y < z.rect[1] + z.rect[3]);
for (const s of lvl.spawns.npcs) if (!inZone(s.x, s.y)) errs.push(`npc ${s.id} spawnea fuera de toda zona (${s.x},${s.y})`);
for (const c of lvl.spawns.cajones) if (!inZone(c.x, c.y)) errs.push(`cajón fuera de zona (${c.x},${c.y})`);
if (!inZone(lvl.spawns.player.x, lvl.spawns.player.y)) errs.push('el jugador spawnea fuera de toda zona');

function fail() {
  console.error('\n✖ Validación de datos fallida:\n');
  for (const e of errs) console.error('  -', e);
  process.exit(1);
}

if (errs.length) fail();

console.log(
  `✔ Datos válidos — ${loaded.size} archivos · ${npcs.size} npcs · ${items.size} ítems · ` +
    `${trigs.size} triggers · ${dlgIds.size} diálogos · ${codex.size} fichas de códice`,
);
