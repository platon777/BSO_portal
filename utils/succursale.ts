const SUCCURSALE_ENTRIES: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Cap-Haitien' },
  { id: 2, label: 'Vertieres' },
  { id: 3, label: 'Champin' },
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const getSuccursaleLabel = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined;

  const raw = String(value).trim();
  const byId = SUCCURSALE_ENTRIES.find((entry) => String(entry.id) === raw);
  if (byId) return byId.label;

  const normalizedRaw = normalizeText(raw);
  const byLabel = SUCCURSALE_ENTRIES.find((entry) => normalizeText(entry.label) === normalizedRaw);
  return byLabel?.label;
};

export const getSuccursaleId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const asNumber = parseInt(raw, 10);
    if (SUCCURSALE_ENTRIES.some((entry) => entry.id === asNumber)) {
      return asNumber;
    }
  }

  const normalizedRaw = normalizeText(raw);
  const byLabel = SUCCURSALE_ENTRIES.find((entry) => normalizeText(entry.label) === normalizedRaw);
  return byLabel ? byLabel.id : null;
};

export const getSuccursaleOptions = () =>
  SUCCURSALE_ENTRIES.map((entry) => ({
    id: entry.id,
    label: entry.label,
  }));
