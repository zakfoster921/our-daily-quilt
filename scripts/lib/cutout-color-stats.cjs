/** Shared color/tone statistics for speaker cutouts (read-only helpers). */
function stats(raw, width, height) {
  let opaque = 0;
  let warmApp = 0; // app test: r > b + 4
  let sepia = 0; // fixed test: warm AND green on the sepia ratio
  let chromaSum = 0;
  let lumSum = 0;
  const hist = new Uint32Array(256);
  for (let i = 0; i < width * height * 4; i += 4) {
    if (raw[i + 3] < 250) continue;
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    opaque += 1;
    if (r > b + 4) {
      warmApp += 1;
      if (Math.abs(g - b - 0.642 * (r - b)) <= 6) sepia += 1;
    }
    chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    lumSum += lum;
    hist[lum] += 1;
  }
  if (opaque < 400) return null;
  let acc = 0;
  let median = 0;
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc >= opaque / 2) {
      median = v;
      break;
    }
  }
  return {
    warmApp: +(warmApp / opaque).toFixed(3),
    sepia: +(sepia / opaque).toFixed(3),
    chroma: +(chromaSum / opaque).toFixed(1),
    meanLum: +(lumSum / opaque).toFixed(1),
    medianLum: median
  };
}

function classify(s) {
  const toned = s.sepia > 0.65;
  if (toned) {
    return s.medianLum < 85 ? 'toned-but-dark' : 'toned';
  }
  if (s.warmApp > 0.65) return 'COLOR-skipped-by-app';
  if (s.warmApp > 0.55) return 'COLOR-borderline';
  return 'color';
}

module.exports = { stats, classify };
