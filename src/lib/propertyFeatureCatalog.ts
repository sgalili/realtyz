// Full Yad2-parity catalog of property features, grouped for the compact
// dropdown menus in property edit views. Labels are the saved display text.
export type FeatureOption = {
  label: string;
  /** Recognizes the feature inside imported labels. Defaults to the label itself. */
  re?: RegExp;
  /** Imported attribute keys that flag this feature as present. */
  keys?: string[];
};

export type FeatureGroup = {
  id: string;
  title: string;
  /** Only one option may be selected (e.g. property condition). */
  single?: boolean;
  options: FeatureOption[];
};

/** Labels backed by dedicated boolean fields on the edit form. */
export const BASE_FEATURE_LABELS = {
  elevator: 'מעלית',
  balcony: 'מרפסת',
  ac: 'מיזוג',
  shelter: 'ממ"ד',
  solar: 'דוד שמש',
} as const;

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'condition', title: 'מצב הנכס', single: true,
    options: [
      { label: 'חדש מקבלן', re: /חדש מקבלן|לא גרו/i, keys: ['newFromContractor'] },
      { label: 'חדש', re: /^חדש$|^new$/i },
      { label: 'משופצת', re: /משופצ|שיפוץ(?! נדרש)|renovat/i, keys: ['renovated'] },
      { label: 'שמור', re: /^שמור|במצב טוב|good condition/i },
      { label: 'דורש שיפוץ', re: /דורש שיפוץ|needs.?renov/i },
    ],
  },
  {
    id: 'climate', title: 'מיזוג וחימום',
    options: [
      { label: BASE_FEATURE_LABELS.ac },
      { label: 'מזגן טורנדו', re: /טורנדו|tornado/i, keys: ['tornado'] },
      { label: 'מיזוג מרכזי', re: /מיזוג מרכזי|central/i },
      { label: BASE_FEATURE_LABELS.solar },
      { label: 'חימום תת רצפתי', re: /תת.?רצפתי|underfloor/i },
    ],
  },
  {
    id: 'building', title: 'בניין וגישה',
    options: [
      { label: BASE_FEATURE_LABELS.elevator },
      { label: 'גישה לנכים', re: /נכים|נגיש|accessib|handicap/i, keys: ['accessibility', 'handicapped'] },
      { label: 'בניין על עמודים', re: /עמודים|pillar/i, keys: ['pillarBuilding'] },
      { label: 'לובי מפואר', re: /לובי|lobby/i },
      { label: 'שומר בכניסה', re: /שומר|סדרן|doorman/i, keys: ['doorman'] },
    ],
  },
  {
    id: 'outdoor', title: 'שטחים וחניה',
    options: [
      { label: BASE_FEATURE_LABELS.balcony },
      { label: 'מרפסת שמש', re: /מרפסת שמש/i },
      { label: 'גינה', re: /גינה|garden/i, keys: ['garden'] },
      { label: 'מחסן', re: /מחסן|storage|warehouse/i, keys: ['storage', 'warehouse'] },
      { label: 'חניה', re: /^חני(ה|יה)?$/i },
      { label: 'חניה מקורה', re: /חניה מקורה|covered parking/i },
      { label: 'בריכה', re: /בריכה|pool/i, keys: ['pool'] },
    ],
  },
  {
    id: 'security', title: 'ביטחון ומיגון',
    options: [
      { label: BASE_FEATURE_LABELS.shelter },
      { label: 'מקלט בבניין', re: /מקלט בבניין|building shelter/i, keys: ['buildingShelter'] },
      { label: 'סורגים', re: /סורג|bars/i, keys: ['bars'] },
      { label: 'דלתות רב בריח', re: /רב.?בריח/i, keys: ['securityDoor'] },
      { label: 'דלתות פנדור', re: /פנדור|pandor/i, keys: ['pandor', 'pandorDoors'] },
    ],
  },
  {
    id: 'interior', title: 'פנים הנכס',
    options: [
      { label: 'מרוהטת', re: /מרוהט|ריהוט|furnish/i, keys: ['furniture', 'furnished'] },
      { label: 'מטבח כשר', re: /כשר|kosher/i, keys: ['kosher'] },
      { label: 'יחידת הורים', re: /יחידת הורים|master/i },
      { label: 'חדר כביסה', re: /חדר כביסה|laundry/i },
    ],
  },
  {
    id: 'air', title: 'כיווני אוויר',
    options: [
      { label: 'פונה צפונה', re: /צפונ/i },
      { label: 'פונה דרומה', re: /דרומ/i },
      { label: 'פונה מזרחה', re: /מזרח/i },
      { label: 'פונה מערבה', re: /מערב/i },
    ],
  },
  {
    id: 'view', title: 'נוף',
    options: [
      { label: 'נוף לים', re: /נוף לים|sea view/i },
      { label: 'נוף פתוח', re: /נוף פתוח|open view/i, keys: ['openView'] },
      { label: 'נוף לפארק', re: /נוף לפארק|park view/i },
      { label: 'נוף עירוני', re: /נוף עירוני|city view/i },
    ],
  },
  {
    id: 'terms', title: 'כניסה ותנאים',
    options: [
      { label: 'כניסה מיידית', re: /כניסה מיידית|immediate/i, keys: ['immediateEntrance'] },
      { label: 'כניסה גמישה', re: /כניסה גמישה|flexible/i, keys: ['enterDateFlexible'] },
      { label: 'בבלעדיות', re: /בלעדיות|exclusive/i, keys: ['assetExclusive'] },
      { label: 'חיות מחמד', re: /חיות|pets/i, keys: ['pets'] },
      { label: 'מתאים לשותפים', re: /שותפים|roommates/i, keys: ['partners'] },
      { label: 'לטווח ארוך', re: /טווח ארוך|long.?term/i, keys: ['longTerm'] },
    ],
  },
];

const BASE_SET = new Set<string>(Object.values(BASE_FEATURE_LABELS));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every non-base option as [label, matcher, attributeKeys]. */
export const EXTRA_FEATURE_OPTIONS: ReadonlyArray<readonly [string, RegExp, string[]]> = FEATURE_GROUPS
  .flatMap((g) => g.options)
  .filter((o) => !BASE_SET.has(o.label))
  .map((o) => [o.label, o.re ?? new RegExp(escape(o.label)), o.keys ?? []] as const);

export const ALL_FEATURE_LABELS = new Set<string>(FEATURE_GROUPS.flatMap((g) => g.options.map((o) => o.label)));

/** Applies a toggle, keeping single-choice groups exclusive. */
export function toggleFeature(selected: string[], label: string, on: boolean): string[] {
  const group = FEATURE_GROUPS.find((g) => g.options.some((o) => o.label === label));
  let next = selected.filter((l) => l !== label);
  if (on) {
    if (group?.single) {
      const siblings = new Set(group.options.map((o) => o.label));
      next = next.filter((l) => !siblings.has(l));
    }
    next.push(label);
  }
  return next;
}
