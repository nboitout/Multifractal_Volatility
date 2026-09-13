// Rebuilds dist/data/manifest.json from whatever curve files are present, so the
// importer and the deriver cannot leave the index disagreeing with the directory.
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

export function rebuildManifest(outDir) {
  const datasets = readdirSync(outDir)
    .filter(f => f.endsWith('.curves.json'))
    .map(file => {
      const {provenance: p, diagnostics: d} = JSON.parse(readFileSync(resolve(outDir, file), 'utf8'));
      return {symbol: p.symbol, label: p.label, kind: p.kind, quantity: p.quantity ?? 'price',
              resolutionMin: p.resolutionMin, from: p.from, to: p.to,
              observations: d.returnsUsed, order: p.order ?? 99, file};
    })
    // measured series first, fixtures last, then by the order the source declares
    .sort((a, b) => (a.kind === 'fixture') - (b.kind === 'fixture') || a.order - b.order || a.symbol.localeCompare(b.symbol));
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify({schema: 2, datasets}, null, 2));
  return datasets;
}
