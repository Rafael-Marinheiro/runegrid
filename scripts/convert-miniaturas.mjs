// Converte as miniaturas PNG de public/data/miniaturas para WebP (≈80% menores) e acerta as referências.
// Uso: npm run miniaturas   (idempotente: pode rodar de novo depois de acrescentar PNGs novos)
// Para uma miniatura nova: solte o .png na pasta, registre-o em public/data/miniatura-catalogo.json
// (ou monster-art-map.json) e rode o comando — o PNG vira .webp e as referências são trocadas.
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const data = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const dir = join(data, 'miniaturas');
const QUALITY = 82;

let before = 0;
let after = 0;
let n = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const src = join(dir, f);
  before += statSync(src).size;
  const out = src.replace(/\.png$/, '.webp');
  await sharp(src).webp({ quality: QUALITY, alphaQuality: 90 }).toFile(out);
  after += statSync(out).size;
  unlinkSync(src);
  n++;
}

for (const f of ['miniatura-catalogo.json', 'monster-art-map.json']) {
  const p = join(data, f);
  const text = readFileSync(p, 'utf8');
  const next = text.replace(/(miniaturas\/[\w.-]+)\.png/g, '$1.webp');
  if (next !== text) writeFileSync(p, next);
}

const mb = (b) => (b / 1024 / 1024).toFixed(1);
console.log(`${n} miniatura(s) convertida(s): ${mb(before)} MB → ${mb(after)} MB`);
