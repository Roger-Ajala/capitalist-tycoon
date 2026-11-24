const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];

export function formatMoney(value: number | string): string {
  const numeric = typeof value === 'string' ? Number(value) : value;

  if (!Number.isFinite(numeric)) {
    return '$ 0.00';
  }

  const abs = Math.abs(numeric);
  const sign = numeric < 0 ? '-' : '';

  if (abs < 1000) {
    return `${sign}$ ${abs.toFixed(2)}`;
  }

  const tier = Math.min(
    Math.floor(Math.log10(abs) / 3),
    SUFFIXES.length - 1
  );
  const scaled = abs / Math.pow(10, tier * 3);

  return `${sign}$ ${scaled.toFixed(2)}${SUFFIXES[tier]}`;
}