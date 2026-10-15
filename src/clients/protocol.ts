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
  const [min, max, limit] = sex === 'MALE' ? [12, 20, 25] : [20, 28, 35];
  if (pct < min) return zone('low', 'Ниже нормы');
  if (pct <= max) return zone('norm', 'Норма');
  if (pct <= limit) return zone('warn', 'Выше нормы');
  return zone('high', 'Высокий');
}

export function waistZone(cm: number, sex: Sex | null): Zone {
  const bounds = sex === 'MALE' ? [94, 102] : [80, 88];
  if (cm < bounds[0]) return zone('norm', 'Норма');
  if (cm <= bounds[1]) return zone('warn', 'Повышенный риск');
  return zone('high', 'Высокий риск');
}

export const MUSCLE_MIN_PCT = { FEMALE: 35, MALE: 40 };

export function musclePct(muscleKg: number, weightKg: number | null) {
  if (!weightKg || weightKg <= 0) return null;
  return round((muscleKg / weightKg) * 100, 1);
}

export function muscleZone(
  muscleKg: number,
  weightKg: number | null,
  sex: Sex | null,
): Zone | null {
  const pct = musclePct(muscleKg, weightKg);
  if (pct == null) return null;
  const min = sex === 'MALE' ? MUSCLE_MIN_PCT.MALE : MUSCLE_MIN_PCT.FEMALE;
  return pct < min ? zone('warn', 'Ниже нормы') : zone('norm', 'Норма');
}

export function metabolicAgeZone(metabolicAge: number, age: number | null) {
  if (age == null) return null;
  return metabolicAge > age
    ? zone('warn', 'Выше фактического')
    : zone('norm', 'Норма');
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
  muscleKg: number | null;
  waterPct: number | null;
  visceralFat: number | null;
  boneKg: number | null;
  metabolicAge: number | null;
  bmr: number | null;
}

interface Verdict {
  text: string;
  risk?: string;
  solution?: string;
}

const VERDICTS: Record<string, Partial<Record<ZoneLevel, Verdict>>> = {
  waist: {
    norm: {
      text: 'Объём талии в безопасной зоне, риск метаболических заболеваний минимальный.',
    },
    warn: {
      text: 'Абдоминальный жир начинает накапливаться.',
      risk: 'Повышение давления, риск диабета.',
      solution:
        'Контроль питания, меньше простых углеводов, добавить кардионагрузку.',
    },
    high: {
      text: 'Висцеральное ожирение: жир откладывается вокруг внутренних органов.',
      risk: 'Сердечно-сосудистые заболевания, диабет 2 типа.',
      solution: 'Дефицит калорий и обязательная регулярная кардионагрузка.',
    },
  },
  whr: {
    norm: {
      text: 'Отличное распределение жира — тип «груша» или «песочные часы», риск сердечно-сосудистых заболеваний низкий.',
    },
    warn: {
      text: 'Жир начинает откладываться в области живота.',
      risk: 'Метаболический синдром.',
      solution: 'Акцент на жиросжигание и укрепление мышц кора.',
    },
    high: {
      text: 'Фигура типа «яблоко» — выраженное накопление жира в области живота.',
      risk: 'Диабет, гипертония, болезни сердца.',
      solution: 'Коррекция питания и регулярное кардио.',
    },
  },
  whtr: {
    low: {
      text: 'Дефицит массы тела: возможно недостаточное питание или низкая мышечная масса.',
      solution: 'Набор веса за счёт мышц, увеличение калорийности.',
    },
    norm: {
      text: 'Вес и объём талии пропорциональны росту.',
    },
    warn: {
      text: 'Избыток абдоминального жира: талия больше половины роста.',
      risk: 'Нарушение обмена веществ.',
      solution: 'Снижение процента жира, контроль порций.',
    },
    high: {
      text: 'Талия составляет больше 60% роста.',
      risk: 'Повышенная нагрузка на сердце и сосуды.',
      solution: 'Изменение образа жизни, консультация нутрициолога.',
    },
  },
  bmi: {
    low: {
      text: 'Вес ниже нормы для вашего роста.',
      solution: 'Набор массы за счёт мышц, увеличение калорийности.',
    },
    norm: { text: 'Вес соответствует росту.' },
    warn: {
      text: 'Избыточная масса тела.',
      risk: 'Замедление метаболизма.',
      solution: 'Дефицит калорий и силовые тренировки.',
    },
    high: {
      text: 'Ожирение — высокий риск для здоровья.',
      risk: 'Диабет, боли в суставах.',
      solution: 'Комплексный подход: питание, кардио и силовые.',
    },
  },
  fat: {
    low: {
      text: 'Процент жира ниже нормы.',
      risk: 'Гормональные сбои, снижение иммунитета.',
      solution: 'Поднять калорийность, добавить полезные жиры в рацион.',
    },
    norm: { text: 'Здоровый процент жира, тело выглядит спортивным.' },
    warn: {
      text: 'Избыточный процент жира («скинни-фэт»): вес может быть в норме, но тело дряблое.',
      risk: 'Скрытое ожирение.',
      solution: 'Замена жира на мышцы через силовые тренировки.',
    },
    high: {
      text: 'Высокий процент жира — нужна серьёзная работа над составом тела.',
      risk: 'Метаболический синдром.',
      solution: 'Контроль питания и регулярные тренировки.',
    },
  },
  muscle: {
    norm: { text: 'Хорошая мышечная масса, метаболизм работает эффективно.' },
    warn: {
      text: 'Низкая мышечная масса. Мышцы — двигатель для сжигания калорий: чем их меньше, тем легче набрать жир.',
      solution:
        'Силовые тренировки 3 раза в неделю, достаточное количество белка.',
    },
  },
  visceral: {
    norm: { text: 'Жир вокруг внутренних органов в безопасном количестве.' },
    warn: {
      text: 'Повышенный уровень: жир обволакивает внутренние органы.',
      risk: 'Нарушение работы печени и сердца.',
      solution: 'Кардио и снижение калорийности рациона.',
    },
    high: {
      text: 'Критический уровень висцерального жира.',
      risk: 'Болезни сердца и сосудов, диабет.',
      solution: 'Консультация врача и нутрициолога, регулярное кардио.',
    },
  },
  water: {
    norm: { text: 'Хороший водный баланс.' },
    low: {
      text: 'Обезвоживание: замедляет метаболизм и восстановление.',
      solution: 'Пить около 30 мл чистой воды на 1 кг веса.',
    },
    high: {
      text: 'Воды больше нормы — возможна задержка жидкости.',
      solution: 'Проверить питьевой режим и количество соли в рационе.',
    },
  },
  metabolicAge: {
    norm: { text: 'Метаболический возраст не выше фактического.' },
    warn: {
      text: 'Метаболический возраст выше фактического: обмен веществ замедлен.',
      solution: 'Набор мышечной массы и регулярное кардио.',
    },
  },
};

export interface Finding {
  key: string;
  title: string;
  value: string;
  level: ZoneLevel;
  zoneLabel: string;
  text: string;
  risk?: string;
  solution?: string;
}

export interface Conclusion {
  strengths: Finding[];
  risks: Finding[];
  notes: string[];
  disclaimer: string;
}

export const DISCLAIMER =
  'Это фитнес-оценка состава тела, а не медицинский диагноз. При показателях из красной зоны рекомендуем консультацию врача.';

const num = (value: number) =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const SEVERITY: Record<ZoneLevel, number> = {
  high: 0,
  warn: 1,
  low: 2,
  norm: 3,
};

const years = (value: number) => {
  const tail = Math.abs(value) % 100;
  if (tail > 10 && tail < 20) return 'лет';
  const last = tail % 10;
  if (last === 1) return 'год';
  if (last >= 2 && last <= 4) return 'года';
  return 'лет';
};

function finding(
  key: string,
  title: string,
  value: string,
  zone: Zone | null,
): Finding | null {
  if (!zone) return null;
  const verdict = VERDICTS[key]?.[zone.level];
  if (!verdict) return null;
  return {
    key,
    title,
    value,
    level: zone.level,
    zoneLabel: zone.label,
    text: verdict.text,
    risk: verdict.risk,
    solution: verdict.solution,
  };
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

  const age = ageAt(card.birthDate, m.takenAt);
  const waist = m.waistCm == null ? null : waistZone(m.waistCm, card.sex);
  const fat = m.fatPct == null ? null : fatZone(m.fatPct, card.sex);
  const muscle =
    m.muscleKg == null ? null : muscleZone(m.muscleKg, m.weightKg, card.sex);
  const water = m.waterPct == null ? null : waterZone(m.waterPct, card.sex);
  const visceral = m.visceralFat == null ? null : visceralZone(m.visceralFat);
  const metabolic =
    m.metabolicAge == null ? null : metabolicAgeZone(m.metabolicAge, age);

  const findings = [
    finding('waist', 'Обхват талии', `${num(m.waistCm ?? 0)} см`, waist),
    finding(
      'whr',
      'Талия / бёдра',
      whr ? num(whr.value) : '',
      whr?.zone ?? null,
    ),
    finding(
      'whtr',
      'Талия / рост',
      whtr ? num(whtr.value) : '',
      whtr?.zone ?? null,
    ),
    finding('bmi', 'ИМТ', bmi ? num(bmi.value) : '', bmi?.zone ?? null),
    finding('fat', '% жира', `${num(m.fatPct ?? 0)} %`, fat),
    finding(
      'muscle',
      'Мышечная масса',
      musclePct(m.muscleKg ?? 0, m.weightKg)
        ? `${num(m.muscleKg ?? 0)} кг · ${num(musclePct(m.muscleKg ?? 0, m.weightKg)!)} % от веса`
        : `${num(m.muscleKg ?? 0)} кг`,
      muscle,
    ),
    finding('visceral', 'Висцеральный жир', num(m.visceralFat ?? 0), visceral),
    finding('water', '% воды', `${num(m.waterPct ?? 0)} %`, water),
    finding(
      'metabolicAge',
      'Метаболический возраст',
      `${num(m.metabolicAge ?? 0)} ${years(m.metabolicAge ?? 0)}`,
      metabolic,
    ),
  ].filter((f): f is Finding => f !== null);

  const notes: string[] = [];
  if (m.bmr)
    notes.push(
      `Базовый метаболизм — ${num(m.bmr)} ккал: столько тело тратит в покое. Питаться ниже этой цифры нельзя, иначе обмен веществ замедлится ещё сильнее.`,
    );
  if (m.boneKg)
    notes.push(
      `Костная масса — ${num(m.boneKg)} кг: ориентир прочности скелета, важен для профилактики остеопороза.`,
    );

  const conclusion: Conclusion = {
    strengths: findings.filter((f) => f.level === 'norm'),
    risks: findings
      .filter((f) => f.level !== 'norm')
      .sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]),
    notes,
    disclaimer: DISCLAIMER,
  };

  return {
    age,
    bmi,
    whr,
    whtr,
    ideal: idealWeight(height, card.sex, card.bodyType),
    waist,
    fat,
    muscle,
    water,
    visceral,
    metabolicAge: metabolic,
    conclusion,
  };
}

export function conclusionText(conclusion: Conclusion) {
  const strengths = conclusion.strengths
    .map((f) => `${f.title} (${f.value}) — ${f.text}`)
    .join('\n');

  const risks = conclusion.risks
    .map((f) => {
      const lines = [`${f.title} (${f.value}) — ${f.zoneLabel}. ${f.text}`];
      if (f.risk) lines.push(`Риск: ${f.risk}`);
      if (f.solution) lines.push(`Что делать: ${f.solution}`);
      return lines.join(' ');
    })
    .join('\n');

  return { strengths, risks };
}
