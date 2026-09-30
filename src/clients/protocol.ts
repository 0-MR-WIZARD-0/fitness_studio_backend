export type Sex = 'FEMALE' | 'MALE';
export type BodyType = 'ASTHENIC' | 'NORMOSTHENIC' | 'HYPERSTHENIC';

export type ZoneLevel = 'low' | 'norm' | 'warn' | 'high';

export interface Zone {
  level: ZoneLevel;
  label: string;
}

const zone = (level: ZoneLevel, label: string): Zone => ({ level, label });

export const GIRTH_FIELDS = [
  {
    key: 'chestCm',
    label: 'Обхват груди',
    howTo: 'По выступающим точкам груди',
    norm: 'Индивидуально',
  },
  {
    key: 'waistCm',
    label: 'Обхват талии',
    howTo: 'По узкому месту (2–3 см выше пупка)',
    norm: 'Ж < 80, М < 94',
  },
  {
    key: 'hipsCm',
    label: 'Обхват бёдер',
    howTo: 'По выступающим точкам',
    norm: 'Индивидуально',
  },
  {
    key: 'armCm',
    label: 'Обхват плеча',
    howTo: 'По широкой части бицепса',
    norm: 'Индивидуально',
  },
  {
    key: 'thighCm',
    label: 'Обхват бедра',
    howTo: 'По верхней трети бедра',
    norm: 'Индивидуально',
  },
  {
    key: 'calfCm',
    label: 'Обхват голени',
    howTo: 'По широкой части голени',
    norm: 'Индивидуально',
  },
] as const;

export const BIO_FIELDS = [
  { key: 'weightKg', label: 'Вес', unit: 'кг', norm: 'Индивидуально' },
  { key: 'fatPct', label: '% жира', unit: '%', norm: 'Ж 20–28, М 12–20' },
  {
    key: 'muscleKg',
    label: 'Мышечная масса',
    unit: 'кг',
    norm: 'Индивидуально',
  },
  {
    key: 'visceralFat',
    label: 'Висцеральный жир',
    unit: '',
    norm: '1–9; повышен 10–14; высокий 15+',
  },
  { key: 'waterPct', label: '% воды', unit: '%', norm: 'Ж 45–60, М 50–65' },
  { key: 'boneKg', label: 'Костная масса', unit: 'кг', norm: 'Индивидуально' },
  {
    key: 'metabolicAge',
    label: 'Метаболический возраст',
    unit: 'лет',
    norm: 'Не выше фактического',
  },
  {
    key: 'bmr',
    label: 'Базовый метаболизм',
    unit: 'ккал',
    norm: 'Индивидуально',
  },
] as const;

export const BODY_TYPES: {
  value: BodyType;
  label: string;
  brocaAdj: number;
}[] = [
  { value: 'ASTHENIC', label: 'Астеник', brocaAdj: -0.1 },
  { value: 'NORMOSTHENIC', label: 'Нормостеник', brocaAdj: 0 },
  { value: 'HYPERSTHENIC', label: 'Гиперстеник', brocaAdj: 0.1 },
];

export const ZONE_TABLES = {
  whr: {
    title: 'Т/Б = Талия ÷ Бёдра',
    rows: [
      { label: 'Норма', female: '< 0,85', male: '< 0,95' },
      { label: 'Повышенный риск', female: '0,85–0,89', male: '0,95–0,99' },
      { label: 'Высокий риск', female: '0,90 и выше', male: '1,0 и выше' },
    ],
  },
  whtr: {
    title: 'Т/Р = Талия ÷ Рост',
    rows: [
      { label: 'Недостаток', value: '< 0,4' },
      { label: 'Норма', value: '0,4–0,49' },
      { label: 'Повышенный риск', value: '0,5–0,59' },
      { label: 'Высокий риск', value: '0,6 и выше' },
    ],
  },
  bmi: {
    title: 'ИМТ',
    rows: [
      { label: 'Дефицит массы', value: '< 18,5' },
      { label: 'Норма', value: '18,5–24,9' },
      { label: 'Избыток', value: '25–29,9' },
      { label: 'Ожирение', value: '30 и выше' },
    ],
  },
} as const;

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function whrZone(ratio: number, sex: Sex | null): Zone {
  const bounds = sex === 'MALE' ? [0.95, 1.0] : [0.85, 0.9];
  if (ratio < bounds[0]) return zone('norm', 'Норма');
  if (ratio < bounds[1]) return zone('warn', 'Повышенный риск');
  return zone('high', 'Высокий риск');
}

export function whtrZone(ratio: number): Zone {
  if (ratio < 0.4) return zone('low', 'Недостаток');
  if (ratio < 0.5) return zone('norm', 'Норма');
  if (ratio < 0.6) return zone('warn', 'Повышенный риск');
  return zone('high', 'Высокий риск');
}

export function bmiZone(bmi: number): Zone {
  if (bmi < 18.5) return zone('low', 'Дефицит массы');
  if (bmi < 25) return zone('norm', 'Норма');
  if (bmi < 30) return zone('warn', 'Избыток');
  return zone('high', 'Ожирение');
}

export function fatZone(pct: number, sex: Sex | null): Zone {
  const [min, max] = sex === 'MALE' ? [12, 20] : [20, 28];
  if (pct < min) return zone('low', 'Ниже нормы');
  if (pct <= max) return zone('norm', 'Норма');
  return zone('high', 'Выше нормы');
}

export function waterZone(pct: number, sex: Sex | null): Zone {
  const [min, max] = sex === 'MALE' ? [50, 65] : [45, 60];
  if (pct < min) return zone('low', 'Ниже нормы');
  if (pct <= max) return zone('norm', 'Норма');
  return zone('high', 'Выше нормы');
}

export function visceralZone(value: number): Zone {
  if (value <= 9) return zone('norm', 'Норма');
  if (value <= 14) return zone('warn', 'Повышен');
  return zone('high', 'Высокий');
}

export function ageAt(birthDate: Date | null, on: Date): number | null {
  if (!birthDate) return null;
  let age = on.getFullYear() - birthDate.getFullYear();
  const months = on.getMonth() - birthDate.getMonth();
  if (months < 0 || (months === 0 && on.getDate() < birthDate.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function idealWeight(
  heightCm: number | null,
  sex: Sex | null,
  bodyType: BodyType | null,
) {
  if (!heightCm || heightCm <= 0)
    return { broca: null, lorentz: null, bmiRef: null, average: null };

  const adjust = BODY_TYPES.find((t) => t.value === bodyType)?.brocaAdj ?? 0;
  const broca = round((heightCm - 100) * (1 + adjust), 1);

  const divisor = sex === 'MALE' ? 4 : 2;
  const lorentz = round(heightCm - 100 - (heightCm - 150) / divisor, 1);

  const meters = heightCm / 100;
  const bmiRef = round(22 * meters * meters, 1);

  const all = [broca, lorentz, bmiRef];
  const average = round(all.reduce((sum, v) => sum + v, 0) / all.length, 1);
  return { broca, lorentz, bmiRef, average };
}

export interface CardBasics {
  sex: Sex | null;
  birthDate: Date | null;
  heightCm: number | null;
  bodyType: BodyType | null;
}

export interface MeasurementNumbers {
  takenAt: Date;
  waistCm: number | null;
  hipsCm: number | null;
  weightKg: number | null;
  fatPct: number | null;
  waterPct: number | null;
  visceralFat: number | null;
}

export function derive(card: CardBasics, m: MeasurementNumbers) {
  const height = card.heightCm && card.heightCm > 0 ? card.heightCm : null;

  const whr =
    m.waistCm && m.hipsCm
      ? { value: round(m.waistCm / m.hipsCm), zone: null as Zone | null }
      : null;
  if (whr) whr.zone = whrZone(whr.value, card.sex);

  const whtr =
    m.waistCm && height
      ? { value: round(m.waistCm / height), zone: null as Zone | null }
      : null;
  if (whtr) whtr.zone = whtrZone(whtr.value);

  const bmi =
    m.weightKg && height
      ? {
          value: round(m.weightKg / (height / 100) ** 2, 1),
          zone: null as Zone | null,
        }
      : null;
  if (bmi) bmi.zone = bmiZone(bmi.value);

  return {
    age: ageAt(card.birthDate, m.takenAt),
    bmi,
    whr,
    whtr,
    ideal: idealWeight(height, card.sex, card.bodyType),
    fat: m.fatPct == null ? null : fatZone(m.fatPct, card.sex),
    water: m.waterPct == null ? null : waterZone(m.waterPct, card.sex),
    visceral: m.visceralFat == null ? null : visceralZone(m.visceralFat),
  };
}
