export const DEFAULT_FONT_FAMILY = "Poppins";

export const DEFAULT_FONT_WEIGHT_LABEL = "Semibold";

export const FONT_WEIGHT_CHOICES = [
  { label: "Regular", value: "400" },
  { label: "Medium", value: "500" },
  { label: "Semibold", value: "600" },
  { label: "Bold", value: "700" },
] as const;

const FONT_WEIGHT_LABEL_LOOKUP = FONT_WEIGHT_CHOICES.reduce<Record<string, string>>(
  (acc, { label }) => {
    acc[label.toLowerCase()] = label;
    return acc;
  },
  {}
);

export const FONT_WEIGHT_LABEL_TO_VALUE = FONT_WEIGHT_CHOICES.reduce<Record<string, string>>(
  (acc, { label, value }) => {
    acc[label] = value;
    return acc;
  },
  {}
);

export const FONT_WEIGHT_VALUE_TO_LABEL = FONT_WEIGHT_CHOICES.reduce<Record<string, string>>(
  (acc, { label, value }) => {
    acc[value] = label;
    return acc;
  },
  {}
);

export function normalizeFontWeightLabel(raw: string | number | null | undefined): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      const labelMatch = FONT_WEIGHT_LABEL_LOOKUP[trimmed.toLowerCase()];
      if (labelMatch) return labelMatch;
      const numericMatch = FONT_WEIGHT_VALUE_TO_LABEL[trimmed];
      if (numericMatch) return numericMatch;
    }
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    const numericMatch = FONT_WEIGHT_VALUE_TO_LABEL[String(raw)];
    if (numericMatch) return numericMatch;
  }
  return DEFAULT_FONT_WEIGHT_LABEL;
}

export function fontWeightLabelToCss(label?: string | null): string {
  const normalized = normalizeFontWeightLabel(label);
  return FONT_WEIGHT_LABEL_TO_VALUE[normalized] ?? FONT_WEIGHT_LABEL_TO_VALUE[DEFAULT_FONT_WEIGHT_LABEL];
}
