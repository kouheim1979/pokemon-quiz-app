import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const API = "https://pokeapi.co/api/v2";
const OUT = path.resolve("pokemon-data.json");
const CACHE_DIR = path.resolve(".pokeapi-cache");
const MAX_SPECIES = Number(process.env.POKEMON_MAX_SPECIES || 1025);
const CONCURRENCY = Number(process.env.POKEAPI_CONCURRENCY || 8);

const TYPE_JA = {
  normal: "ノーマル", fire: "ほのお", water: "みず", electric: "でんき", grass: "くさ", ice: "こおり",
  fighting: "かくとう", poison: "どく", ground: "じめん", flying: "ひこう", psychic: "エスパー",
  bug: "むし", rock: "いわ", ghost: "ゴースト", dragon: "ドラゴン", dark: "あく", steel: "はがね", fairy: "フェアリー"
};
const COLOR_JA = { black:"黒", blue:"青", brown:"茶", gray:"灰", green:"緑", pink:"桃", purple:"紫", red:"赤", white:"白", yellow:"黄" };
const SHAPE_JA = { ball:"球状", squiggle:"細長い", fish:"魚型", arms:"腕型", blob:"不定形", upright:"二足", legs:"多足", quadruped:"四足", wings:"翼型", tentacles:"触手型", heads:"複数頭", humanoid:"人型", bug_wings:"虫の羽", armor:"装甲型" };
const HABITAT_JA = { cave:"洞窟", forest:"森", grassland:"草地", mountain:"山地", rare:"希少地域", rough_terrain:"荒地", sea:"海", urban:"街", waters_edge:"水辺" };
const REGION_BY_GEN = { "generation-i":"カントー", "generation-ii":"ジョウト", "generation-iii":"ホウエン", "generation-iv":"シンオウ", "generation-v":"イッシュ", "generation-vi":"カロス", "generation-vii":"アローラ", "generation-viii":"ガラル", "generation-ix":"パルデア" };
const GEN_JA = { "generation-i":"第1世代", "generation-ii":"第2世代", "generation-iii":"第3世代", "generation-iv":"第4世代", "generation-v":"第5世代", "generation-vi":"第6世代", "generation-vii":"第7世代", "generation-viii":"第8世代", "generation-ix":"第9世代" };

async function fetchJson(url) {
  await mkdir(CACHE_DIR, { recursive: true });
  const safe = Buffer.from(url).toString("base64url") + ".json";
  const file = path.join(CACHE_DIR, safe);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const res = await fetch(url, { headers: { "user-agent": "pokemon-quiz-app-data-builder" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const data = await res.json();
  await writeFile(file, JSON.stringify(data), "utf8");
  return data;
}

function pickJa(names, fallback) {
  return names?.find(n => n.language.name === "ja-Hrkt")?.name || names?.find(n => n.language.name === "ja")?.name || names?.find(n => n.language.name === "en")?.name || fallback;
}
function pickEn(names, fallback) {
  return names?.find(n => n.language.name === "en")?.name || fallback;
}
function genusJa(genera, fallback) {
  return genera?.find(g => g.language.name === "ja-Hrkt")?.genus || genera?.find(g => g.language.name === "ja")?.genus || genera?.find(g => g.language.name === "en")?.genus || fallback;
}
function cap(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
function pokemonIdFromUrl(url) { return Number(url.match(/\/pokemon-species\/(\d+)\//)?.[1] || 0); }

function inferActivity(types, habitat) {
  if (types.includes("ゴースト") || types.includes("あく")) return "夜型";
  if (types.includes("でんき")) return "昼型";
  if (habitat === "洞窟") return "夜型";
  if (habitat === "海" || habitat === "水辺") return "昼夜どちらも";
  return "昼型";
}
function inferDiet(types, habitat) {
  if (types.includes("くさ")) return "日光・水・栄養のある土";
  if (types.includes("みず")) return "水草・小魚・水辺のえさ";
  if (types.includes("いわ") || types.includes("はがね")) return "鉱物・硬いえさ";
  if (types.includes("ゴースト")) return "不明";
  if (types.includes("ドラゴン")) return "木の実・肉類";
  if (habitat === "森" || habitat === "草地") return "木の実・草・小さな虫";
  return "木の実・小さな食べ物";
}
function inferLevel(id, isLegendary, isMythical) {
  if (isLegendary || isMythical) return "hard";
  if (id <= 151) return "easy";
  if (id % 3 === 0) return "normal";
  return "normal";
}
function makeStats(types, id, isLegendary, isMythical) {
  const s = { power:3, speed:3, brain:3, friend:3, rare:2 };
  if (types.includes("ドラゴン") || types.includes("かくとう") || types.includes("ほのお")) s.power++;
  if (types.includes("でんき") || types.includes("ひこう") || types.includes("あく")) s.speed++;
  if (types.includes("エスパー") || types.includes("はがね")) s.brain++;
  if (types.includes("フェアリー") || types.includes("ノーマル") || types.includes("くさ")) s.friend++;
  if (isLegendary || isMythical) { s.power=5; s.brain=Math.max(s.brain,4); s.rare=5; s.friend=Math.min(s.friend,2); }
  else if (id > 800) s.rare = 3;
  for (const k of Object.keys(s)) s[k] = Math.max(1, Math.min(5, s[k]));
  return s;
}
function makeFeatures(p) {
  const f = [];
  if (p.types.includes("でんき")) f.push("電気を使った動きや攻撃が得意");
  if (p.types.includes("ほのお")) f.push("熱や炎に関係する特徴を持つ");
  if (p.types.includes("みず")) f.push("水辺での行動に強い");
  if (p.types.includes("くさ")) f.push("植物や日光と関係が深い");
  if (p.types.includes("ドラゴン")) f.push("迫力のあるドラゴンらしい存在感がある");
  if (p.types.includes("ゴースト")) f.push("気配を消したり不思議な行動をしやすい");
  if (p.shape && p.shape !== "不明") f.push(`${p.shape}の体つきが特徴`);
  if (p.habitat && p.habitat !== "不明") f.push(`${p.habitat}に適応した暮らしをする`);
  f.push(`${p.generation}・${p.region}に分類されるポケモン`);
  return [...new Set(f)].slice(0, 4);
}
function makeHints(p) {
  const hints = [];
  hints.push(`${p.types.join("・")}タイプのポケモン。`);
  if (p.genus && p.genus !== "不明") hints.push(`分類は「${p.genus}」。`);
  hints.push(`${p.region}地方に関係が深い。`);
  hints.push(`高さは約${p.heightM}m、重さは約${p.weightKg}kg。`);
  return hints.slice(0, 3);
}
function makeDescription(p) {
  const typeText = p.types.join("・");
  const habitatText = p.habitat && p.habitat !== "不明" ? `${p.habitat}に適応し、` : "";
  return `${p.name.ja}は${typeText}タイプの${p.genus}です。${habitatText}${p.shape}の体つきや${p.color}系の特徴を持ちます。図鑑学習では、タイプ・すがた・生息イメージを合わせて覚えると当てやすくなります。`;
}
async function buildEvolutionText(species) {
  if (!species.evolution_chain?.url) return "進化情報なし";
  const chain = await fetchJson(species.evolution_chain.url);
  const paths = [];
  function walk(node, acc) {
    const name = node.species?.name || "unknown";
    const id = pokemonIdFromUrl(node.species?.url || "");
    const label = id ? `#${id}` : name;
    const next = [...acc, label];
    if (!node.evolves_to || node.evolves_to.length === 0) paths.push(next);
    else node.evolves_to.forEach(child => walk(child, next));
  }
  walk(chain.chain, []);
  return paths.map(path => path.join(" → ")).join(" / ");
}
async function buildOne(id) {
  const species = await fetchJson(`${API}/pokemon-species/${id}/`);
  const pokemon = await fetchJson(`${API}/pokemon/${id}/`);
  const types = pokemon.types.sort((a,b)=>a.slot-b.slot).map(t => TYPE_JA[t.type.name] || t.type.name);
  const genName = species.generation?.name || "";
  const obj = {
    id,
    slug: species.name,
    name: { ja: pickJa(species.names, cap(species.name)), en: pickEn(species.names, cap(species.name)) },
    aliases: [],
    region: REGION_BY_GEN[genName] || "不明",
    generation: GEN_JA[genName] || genName || "不明",
    types,
    genus: genusJa(species.genera, "不明"),
    heightM: pokemon.height / 10,
    weightKg: pokemon.weight / 10,
    color: COLOR_JA[species.color?.name] || species.color?.name || "不明",
    shape: SHAPE_JA[species.shape?.name] || species.shape?.name || "不明",
    habitat: HABITAT_JA[species.habitat?.name] || "不明",
    activity: "",
    diet: "",
    evolution: await buildEvolutionText(species),
    description: "",
    features: [],
    hints: [],
    stats: {},
    level: inferLevel(id, species.is_legendary, species.is_mythical)
  };
  obj.aliases = [obj.name.ja, obj.name.en, species.name].filter(Boolean);
  obj.activity = inferActivity(obj.types, obj.habitat);
  obj.diet = inferDiet(obj.types, obj.habitat);
  obj.stats = makeStats(obj.types, id, species.is_legendary, species.is_mythical);
  obj.features = makeFeatures(obj);
  obj.hints = makeHints(obj);
  obj.description = makeDescription(obj);
  return obj;
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i]); console.log(`built ${items[i]}`); }
      catch (e) { console.error(`failed ${items[i]}:`, e.message); }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out.filter(Boolean);
}
async function main() {
  const ids = Array.from({ length: MAX_SPECIES }, (_, i) => i + 1);
  const pokemon = await mapLimit(ids, CONCURRENCY, buildOne);
  pokemon.sort((a,b)=>a.id-b.id);
  const data = {
    meta: {
      schemaVersion: 2,
      mode: "full",
      count: pokemon.length,
      source: "PokéAPI structured data",
      generatedAt: new Date().toISOString(),
      note: "説明文は公式図鑑文の転載ではなく、構造化データから生成した学習用要約です。"
    },
    pokemon
  };
  await writeFile(OUT, JSON.stringify(data, null, 2), "utf8");
  console.log(`wrote ${OUT} (${pokemon.length} pokemon)`);
}

main().catch(err => { console.error(err); process.exit(1); });
