const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  bull: '•',
  middot: '·',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
};

const ACCENTS: Record<string, string> = {
  acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', cedil: '\u0327', ring: '\u030A', caron: '\u030C',
};

export function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  let str = input;
  // Decode up to 2 passes to safely unwrap double-encoded entities like &amp;quot; or &amp;sup2;
  for (let i = 0; i < 2; i++) {
    if (!str.includes('&')) break;
    str = str
      .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#(\d+);?/g, (_match, dec: string) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&([a-z][a-z0-9]*);?/gi, (match, name: string) => {
        const value = NAMED_ENTITIES[name.toLowerCase()];
        if (value) return value;
        // &ntilde;, &uacute;, &Eacute;: a letter and its accent.
        const [, letter, mark] = /^([a-z])(acute|grave|circ|uml|tilde|cedil|ring|caron)$/i.exec(name) ?? [];
        return letter && mark ? `${letter}${ACCENTS[mark]}`.normalize('NFC') : match;
      });
  }
  return str;
}

export function stripHtml(input: string): string {
  if (!input) return '';
  return decodeHtmlEntities(
    input
      .replace(/<\s*br\b[^>]*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\b[^>]*>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function stripEmoji(input: string): string {
  return input.replace(/\p{Extended_Pictographic}/gu, '').replace(/\uFE0F/g, '');
}

/**
 * Characters a reader does not see but a model does: bidi overrides that make text display
 * differently from how it reads, Unicode tag characters (U+E0000\u2013E007F) that carry hidden ASCII
 * instructions for LLMs, invisible joiners and separators, and control characters. Post text
 * goes to agents through MCP and the API, so none of these survive.
 */
export function stripInvisible(input: string): string {
  return input
    .replace(/[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g, '')
    .replace(/[\u{e0000}-\u{e007f}]/gu, '')
    .replace(/[\u200b-\u200d\u2060-\u2064\ufeff\u00ad\u2800]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

export function normalizeWhitespace(input: string): string {
  return stripInvisible(input)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Plain text from an arbitrary feed/HTML fragment. */
export function toPlainText(input: string): string {
  return normalizeWhitespace(stripEmoji(stripHtml(input)));
}

export function normalizeForMatch(input: string): string {
  return input
    // NFC first: some boards write «ё» as «е» + combining diaeresis.
    .normalize('NFC')
    .toLocaleLowerCase('ru-RU')
    .replace(/\u0451/g, '\u0435')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const sliced = input.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = (lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced).trimEnd();
  // A truncation cut mid-parenthesis («Разработка… (Draft») leaves unbalanced
  // brackets: drop the incomplete trailing group instead.
  const balanced = base.replace(/\s*\([^()]*$/, '').trimEnd();
  return `${balanced}…`;
}

/** FL.ru and friends append « (Бюджет: 30 000 ₽)» to the RSS title; it is stored separately. */
export function stripBudgetTitleSuffix(input: string): string {
  return input.replace(/\s*\(\s*(?:Бюджет|Budget)\s*:[^)]*\)\s*$/i, '').trim();
}

export type WorkplaceType = 'remote' | 'hybrid' | 'onsite';

/** Physical / in-field occupations that require physical presence and cannot be remote. */
export const PHYSICAL_ONSITE_ROLE_RE =
  /(?:водитель|шофер|курьер|погрузчик|грузчик|экспедитор|повар|бариста|официант|бармен|монтажн|сантехник|электрик|сварщик|охранник|сторож|уборщиц|клинер|автослесар|механик|маляр|парикмахер|массажист|кассир|мерчендайзер|промоутер|кладовщик|комплектовщик|фасовщик|закройщик|швея|слесарь|токарь|сборщик|разнорабоч|разгрузк|дворник)/i;

/** Technical, medical, administrative, or linguistic false-positive occurrences of "удален...". */
export const REMOTE_FALSE_POSITIVE_RE =
  /(?:не\s+(?:рассматриваем\s+)?удал[её]н|удал[её]н(?:но|ка|ная|ный|ное|ную)?\s+(?:не\s+рассматрива|не\s+предусмотрен|не\s+предлага|исключен)|удал[её]нн\w+\s+(?:оформлен|собеседован|инструктаж|обучен|подключен)|удал[её]нн\w+\s+(?:склад|объект|район|доступ|сервер|управлен)|удал[её]ни[ея]\s+(?:зуб|вмятин|катализатор|тату|дерев|волос|волокон|образован|глаз|новообразован|аппендикс))/i;

/** Explicit on-site presence or field travel markers. */
export const ONSITE_TEXT_RE =
  /(?:только\s+(?:в\s+)?офис|строго\s+(?:в\s+)?офис|работа\s+(?:в\s+)?офисе|очный\s+(?:формат|режим|график)|разъездн\w+\s+(?:характер|режим|график|работ)|поездки\s+по\s+клиентам|посещение\s+клиентов|работа\s+на\s+объектах|работа\s+на\s+складе|работа\s+на\s+производстве|на\s+территории\s+работодателя)/i;

/** Explicit hybrid work markers (office + remote mix). */
export const HYBRID_TEXT_RE =
  /(?:гибрид(?:ный|но|ная|ное)?|hybrid|офис\s*\/\s*удал[её]н|удал[её]нка\s*\/\s*офис|\d\s*(?:дня|дней|днях|дн\.)\s*(?:в\s*офисе|из\s*дома)|выезд\w*\s+в\s+офис|периодическ\w*\s+(?:выезд\w*|посещен\w*)\s+(?:в\s+)?офис)/i;

/** Explicit positive remote work markers. */
export const REMOTE_POSITIVE_RE =
  /(?:полная\s+удал[её]нка|строго\s+удал[её]н|100%\s+remote|удал[её]нн(?:ая|ое|ый|ую)\s+(?:работ|формат|график|занятост|ваканси)|remote\s+work|work\s+from\s+home|\btelecommute\b|из\s+любой\s+точки(?:\s+мира|\s+рф)?|можно\s+удал[её]н|только\s+удал[её]н|дистанционн(?:ая|ое|ый|ую)\s+(?:работ|формат|график|занятост)|работа\s+из\s+дома)/i;

/** Remote work mentioned in a title or text. Kept in sync with the SQL filter in the Postgres store. */
export const REMOTE_TEXT_RE = REMOTE_POSITIVE_RE;

/**
 * Classifies workplace arrangements into 'remote', 'hybrid', or 'onsite'.
 * Implements a 3-step cascade:
 * 1. Physical Feasibility Gate: roles requiring in-person presence (driver, courier, cleaner).
 * 2. Contextual Linguistic Gate: false positives, negations, hybrid, and positive remote markers.
 * 3. Default Arbitration: vacancies without remote markers default to onsite; digital freelance to remote.
 */
export function classifyWorkplace(lead: {
  title: string;
  text?: string;
  city?: string;
  type?: 'job' | 'gig';
  explicitRemote?: boolean;
}): { workplaceType: WorkplaceType; isRemote: boolean } {
  const fullText = `${lead.title}\n${lead.text ?? ''}`;

  // 1. Physical / In-Field Feasibility Gate:
  if (PHYSICAL_ONSITE_ROLE_RE.test(lead.title)) {
    const isDeskCoordinator = /(?:диспетчер|координатор|логист|менеджер|оператор)/i.test(lead.title);
    if (!isDeskCoordinator) {
      return { workplaceType: 'onsite', isRemote: false };
    }
  }

  // 2. Explicit source indicator (e.g. from structured board fields)
  if (lead.explicitRemote === false) {
    return { workplaceType: 'onsite', isRemote: false };
  }

  const hasFalsePositive = REMOTE_FALSE_POSITIVE_RE.test(fullText);
  const hasPositiveRemote = REMOTE_POSITIVE_RE.test(fullText);
  const hasHybrid = HYBRID_TEXT_RE.test(fullText);
  const hasOnsite = ONSITE_TEXT_RE.test(fullText);
  const isCityOnline = Boolean(lead.city && /^(онлайн|удал)/i.test(lead.city));

  if (hasHybrid) {
    return { workplaceType: 'hybrid', isRemote: false };
  }

  if (hasOnsite && !hasPositiveRemote) {
    return { workplaceType: 'onsite', isRemote: false };
  }

  if (hasPositiveRemote && !hasFalsePositive) {
    return { workplaceType: 'remote', isRemote: true };
  }

  if (isCityOnline && !hasFalsePositive && !hasOnsite) {
    return { workplaceType: 'remote', isRemote: true };
  }

  if (lead.explicitRemote === true && !hasFalsePositive && !hasOnsite) {
    return { workplaceType: 'remote', isRemote: true };
  }

  // 3. Defaults:
  // Vacancies (jobs) are on-site unless explicitly stated as remote.
  if (lead.type === 'job') {
    return { workplaceType: 'onsite', isRemote: false };
  }

  // Gigs (freelance): digital tasks without an explicit physical city default to remote.
  if (!lead.city || isCityOnline) {
    return { workplaceType: 'remote', isRemote: true };
  }

  return { workplaceType: 'onsite', isRemote: false };
}

/** A lead can be done remotely. Replaces legacy binary checks. */
export function isRemoteLead(lead: {
  city?: string;
  title: string;
  text?: string;
  isRemote?: boolean;
  workplaceType?: WorkplaceType;
  type?: 'job' | 'gig';
}): boolean {
  if (typeof lead.isRemote === 'boolean') return lead.isRemote;
  if (lead.workplaceType) return lead.workplaceType === 'remote';
  return classifyWorkplace({ title: lead.title, text: lead.text ?? '', city: lead.city, type: lead.type }).isRemote;
}


/** Lightweight tech-tag extractor: canonical skill names found in title+text. */
const TECH_SKILL_PATTERNS: Array<[RegExp, string]> = [
  [/(^|[^a-zа-яё0-9])1\s?[сc]([^a-zа-яё0-9]|$)/i, '1С'],
  [/\bclaude\b/i, 'Claude'],
  // «есть GPT, который поможет оформить ТЗ» is not a task for GPT: the name needs a version or a use.
  [/chatgpt|\bgpt[- ]?\d|\bopenai\b|\bgpt[- ]?(?:api|бот|модел|ассистент|агент)|(?:интеграц\S*|подключ\S*|на\s+базе|через)\s+(?:с\s+)?gpt\b/i, 'GPT'],
  [/\bmidjourney\b/i, 'Midjourney'],
  [/\bpython\b/i, 'Python'],
  [/\bjavascript\b|\bjs\b/i, 'JavaScript'],
  [/\btypescript\b|\bts\b/i, 'TypeScript'],
  [/\breact\b|react native/i, 'React'],
  [/\bvue\b/i, 'Vue'],
  // A bare «node» is usually a server: «node management».
  [/\bnode\.?js\b|\bnest\.?js\b|\bnode\s+(?:developer|engineer|разработчик)/i, 'Node.js'],
  [/\bphp\b/i, 'PHP'],
  // The word «go» is English: the language needs a name or company around it.
  [/\bgolang\b|\bGo(?:[- ](?:developer|engineer|разработчик|backend|бэкенд))|(?:^|[\s(])на\s+Go\b|\bGo\s*[,/]\s*(?:Python|Java|Rust|C\+\+|PHP|Kotlin|Kubernetes|Docker|PostgreSQL|gRPC)|(?:Python|Java|Rust|C\+\+|PHP|Kotlin)\s*[,/]\s*Go\b/, 'Golang'],
  [/\bjava\b(?!script)/i, 'Java'],
  [/\bkotlin\b/i, 'Kotlin'],
  [/\bswift\b/i, 'Swift'],
  [/\bc\+\+/i, 'C++'],
  [/\bc#/i, 'C#'],
  [/\.net|dotnet/i, '.NET'],
  [/\bdjango\b/i, 'Django'],
  [/\blaravel\b/i, 'Laravel'],
  [/\bwordpress\b/i, 'WordPress'],
  [/\bwoocommerce\b/i, 'WooCommerce'],
  [/\bbitrix\b|битрикс/i, 'Битрикс'],
  [/\bopencart\b/i, 'OpenCart'],
  [/\btilda\b|тильда/i, 'Tilda'],
  [/\bfigma\b|фигм/i, 'Figma'],
  [/\bphotoshop\b|\bps\b(?![a-z])/i, 'Photoshop'],
  [/\billustrator\b/i, 'Illustrator'],
  [/after effects/i, 'After Effects'],
  [/\bautocad\b|автокад/i, 'AutoCAD'],
  [/\brevit\b/i, 'Revit'],
  [/\bblender\b/i, 'Blender'],
  [/\bcorel\s?draw\b/i, 'CorelDRAW'],
  [/\bsql\b/i, 'SQL'],
  [/\bpostgres\w*\b|постгрес/i, 'PostgreSQL'],
  [/\bmysql\b/i, 'MySQL'],
  [/\bmongo\w*\b/i, 'MongoDB'],
  [/\bdocker\b/i, 'Docker'],
  [/\bkubernetes\b|\bk8s\b/i, 'Kubernetes'],
  [/\bterraform\b/i, 'Terraform'],
  [/\bansible\b/i, 'Ansible'],
  [/\bkafka\b/i, 'Kafka'],
  [/\bredis\b/i, 'Redis'],
  [/\brust\b(?=[\s,./)]|$)(?!\s+(?:belt|proof))/, 'Rust'],
  [/\baws\b/i, 'AWS'],
  [/\bgcp\b|google cloud/i, 'GCP'],
  [/\bazure\b/i, 'Azure'],
  [/\blinux\b/i, 'Linux'],
  [/\bflutter\b/i, 'Flutter'],
  [/\bunity\b/i, 'Unity'],
  [/\bseo\b/i, 'SEO'],
  [/\bsmm\b/i, 'SMM'],
  [/\bexcel\b|экзел|эксель/i, 'Excel'],
  [/телеграм\w*\s*\(?бот|telegram\s*bot/i, 'Telegram Bot'],
  [/нейросет\w*/i, 'Нейросети'],
  [/видеомонтаж|монтаж\S*\s+(?:видео|ролик|reels|клип)|premiere|davinci|reels-?мейкер/i, 'Видеомонтаж'],
  [/моушн|motion\s*design/i, 'Моушн-дизайн'],
  [/логотип|брендбук|фирменн\S*\s+стил|брендинг/i, 'Брендинг'],
  [/иллюстрац|illustration/i, 'Иллюстрация'],
  [/(?:^|[^a-zа-яё0-9])3[dд](?:[^a-zа-яё0-9]|$)|3d-|моделировани/i, '3D'],
  [/копирайт|рерайт|написать\s+(?:текст|стат)|статьи\s+для|сценари/i, 'Тексты'],
  [/перевод(?:чик|\s+(?:текст|с\s|на\s))|\btranslator\b|\btranslation\s+(?:of|from|into)\b/i, 'Переводы'],
  [/таргет|targeting/i, 'Таргет'],
  [/директолог|яндекс\.?\s?директ|google\s+ads|контекстн\S*\s+реклам|(?:^|[^а-яё])директ(?![а-яё])/i, 'Контекстная реклама'],
  // Brands name an employer or a link as often as a trade: «Аналитик (Авито Путешествия)», «отзывы с Ozon».
  [/авитолог|(?:авито|avito)[- ](?:объявлен|продвижен|магазин|реклам)|(?:продвиж\S*|размещ\S*|объявлени\S*|постинг\S*|реклам\S*|магазин\S*|продаж\S*|ведени\S*)\s+(?:\S+\s+){0,2}(?:на|в|для|через)\s+(?:авито|avito)/i, 'Авито'],
  [/маркетплейс|селлер|(?:карточ\S*|продаж\S*|магазин\S*|кабинет\S*|инфографик\S*|реклам\S*|продвиж\S*|ведени\S*)\s+(?:\S+\s+){0,2}(?:на\s+|для\s+)?(?:wildberries|wb|ozon|озон)|(?:^|[^а-яёa-z])(?:на|для)\s+(?:wildberries|wb|ozon|озон)|(?:wildberries|wb|ozon|озон)\s*(?:[/,+и]|\sи\s)\s*(?:wildberries|wb|ozon|озон|яндекс)/i, 'Маркетплейсы'],
  [/бухгалт|accountant/i, 'Бухгалтерия'],
  // «юридическое лицо» and «ЭТрН» in a developer's order are no legal work.
  [/юрист|юрисконсульт|юридическ\S*\s+(?:консультац|услуг|сопровожден|помощ|заключени)|lawyer/i, 'Юриспруденция'],
  [/репетитор|преподава|tutor|teacher/i, 'Обучение'],
  [/фотограф|ретуш|фотосесси/i, 'Фото'],
  [/менеджер\S*\s+(?:по\s+)?(?:активн\S*\s+)?продаж|отдел\S*\s+продаж|холодн\S*\s+звон|\bsales\b|account\s+(?:executive|manager)|business\s+development/i, 'Продажи'],
  [/поддержк\S*\s+(?:клиент|пользоват)|техподдержк|техническ\S*\s+поддержк|customer\s+(?:support|success)|support\s+(?:engineer|specialist)|оператор\S*\s+(?:чата|колл)/i, 'Поддержка'],
  [/\bangular\b/i, 'Angular'],
  [/\bnext\.?js\b/i, 'Next.js'],
  [/\bfastapi\b/i, 'FastAPI'],
  [/\bspring\s+boot\b|\bspring\s+framework\b/i, 'Spring'],
  [/\bclickhouse\b/i, 'ClickHouse'],
  [/\belasticsearch\b/i, 'Elasticsearch'],
  [/\brabbitmq\b/i, 'RabbitMQ'],
  [/\bgraphql\b/i, 'GraphQL'],
  [/\bairflow\b/i, 'Airflow'],
  [/\bapache\s+spark\b|\bpyspark\b/i, 'Spark'],
  [/\bpower\s?bi\b/i, 'Power BI'],
  [/\btableau\b/i, 'Tableau'],
  [/\bselenium\b/i, 'Selenium'],
  [/\bplaywright\b/i, 'Playwright'],
  [/\bjira\b/i, 'Jira'],
  [/\bsalesforce\b/i, 'Salesforce'],
  [/\bhubspot\b/i, 'HubSpot'],
  [/\bamo\s?crm\b|амо\s?црм/i, 'amoCRM'],
  [/\bn8n\b/i, 'n8n'],
  [/\bCursor\b|\bcursor\s+ai\b/, 'Cursor'],
  [/\blovable\b/i, 'Lovable'],
  [/вайб[- ]?код|\bvibe[- ]?cod/i, 'Вайб-кодинг'],
  [/\bcomfy\s?ui\b/i, 'ComfyUI'],
  [/\bLoRA\b|\bLORA\b/, 'LoRA'],
  [/\bstable\s+diffusion\b/i, 'Stable Diffusion'],
];

/**
 * Trades, for posts that name no tool: «Тестировщик», «Маркетолог», «Recruiter». A trade is
 * the role itself, so extractSkills() reads these only in the title and the requirements —
 * never in the company blurb or the benefits («наш HR поможет», «тестирование гипотез»,
 * «developer platform» hang them on sales and management posts otherwise).
 */
const ROLE_SKILL_PATTERNS: Array<[RegExp, string]> = [
  [/тестировщик|тестировани|\bqa\b|\bsdet\b|автотест/i, 'Тестирование'],
  [/\bdevops\b|\bsre\b|девопс/i, 'DevOps'],
  [/системн\S*\s+администратор|сисадмин|system\s+administrator/i, 'Администрирование'],
  [/\bml\b|machine\s+learning|машинн\S*\s+обучен|data\s+scien/i, 'ML'],
  [/ux\/ui|ui\/ux|\bux\b|ui[- ]дизайн|product\s+designer|продуктов\S*\s+дизайн/i, 'UI/UX'],
  [/дизайнер|designer|графическ\S*\s+дизайн|graphic\s+design/i, 'Дизайн'],
  [/рекрутер|recruiter|recruiting|sourcer|сорсер|подбор\S*\s+персонал|talent\s+acquisition|\bhr\b/i, 'Рекрутинг'],
  [/аналитик|analyst|\banalytics\b/i, 'Аналитика'],
  [/project\s+manager|проджект|руководител\S*\s+проект|менеджер\S*\s+проект/i, 'Управление проектами'],
  [/product\s+(?:manager|owner)|продакт|менеджер\S*\s+продукт/i, 'Продакт-менеджмент'],
  [/маркетолог|marketing|маркетинг/i, 'Маркетинг'],
  [/разработчик|программист|\bdeveloper\b|software\s+engineer|full[- ]?stack|back[- ]?end|front[- ]?end/i, 'Разработка'],
];

const ALL_SKILL_PATTERNS = [...TECH_SKILL_PATTERNS, ...ROLE_SKILL_PATTERNS];

/** Names of the trade tags, which only the title and the requirements may set. */
export const ROLE_SKILLS: ReadonlySet<string> = new Set(ROLE_SKILL_PATTERNS.map(([, name]) => name));

/** Every dictionary skill found anywhere in `input`: for short strings such as a title or a query. */
export function extractTechSkills(input: string, max = 8): string[] {
  if (!input) return [];
  const found: string[] = [];
  for (const [pattern, name] of ALL_SKILL_PATTERNS) {
    if (pattern.test(input)) {
      found.push(name);
      if (found.length >= max) break;
    }
  }
  return found;
}

const REQUIREMENTS_HEAD = /^\s*(?:требования|требуется|мы\s+ждём|мы\s+ждем|ожидаем|что\s+(?:мы\s+)?ждём|что\s+(?:мы\s+)?ждем|кого\s+(?:мы\s+)?ищем|requirements|qualifications|what\s+you(?:'|’)?ll\s+need|what\s+we(?:'|’)?re\s+looking\s+for|who\s+you\s+are|you\s+have|must[- ]have)(?![a-zа-яё])/i;
const OTHER_HEAD = /^\s*(?:условия|мы\s+предлагаем|что\s+(?:мы\s+)?предлагаем|о\s+(?:нас|компании)|обязанности|задачи|бонусы|плюсом|будет\s+плюсом|benefits|perks|we\s+offer|what\s+we\s+offer|about\s+(?:us|the\s+company)|responsibilities|nice\s+to\s+have)(?![a-zа-яё])/i;
/** The same block headers without the start anchor: one-line posts pack the blocks together. */
const OTHER_HEAD_ANY = new RegExp(OTHER_HEAD.source.replace(/^\^/, ''), 'i');

/**
 * Where a post names its role: the title, the requirements block and, when the title is only
 * the post's own first line (Telegram), the lines right under it.
 */
function roleWindow(title: string, text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parts = [title];
  const firstLine = lines[0] ?? '';
  if (title && firstLine && (firstLine.startsWith(title.replace(/[….]+$/, '').trim()) || title.startsWith(firstLine))) {
    parts.push(...lines.slice(1, 3));
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (!REQUIREMENTS_HEAD.test(lines[i]!) || lines[i]!.length > 80) continue;
    // One-line posts pack «Требования: … Условия: …» together: cut at the next block's header.
    let line = lines[i]!;
    const headAt = line.search(REQUIREMENTS_HEAD);
    const other = OTHER_HEAD_ANY.exec(line.slice(headAt));
    if (other) line = line.slice(0, headAt + other.index);
    parts.push(line);
    for (let j = i + 1; j < lines.length && j <= i + 12; j += 1) {
      if (REQUIREMENTS_HEAD.test(lines[j]!) || OTHER_HEAD.test(lines[j]!)) break;
      parts.push(lines[j]!);
    }
  }
  return parts.join('\n');
}

/**
 * Skills of a post: tools and technologies from the whole text, trades (Тестирование,
 * Рекрутинг, Разработка…) only from the title and the requirements.
 */
export function extractSkills(title: string, text: string, max = 8): string[] {
  const all = `${title}\n${text}`;
  const found: string[] = [];
  // Technologies read anywhere in the post; trades wait for the role window below.
  for (const [pattern, name] of TECH_SKILL_PATTERNS) {
    if (!pattern.test(all)) continue;
    found.push(name);
    if (found.length >= max) break;
  }
  for (const name of extractTechSkills(roleWindow(title, text))) {
    if (!ROLE_SKILLS.has(name) || found.includes(name)) continue;
    found.push(name);
    if (found.length >= max) break;
  }
  return found;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * JSON for an inline <script> block (e.g. JSON-LD). JSON.stringify alone does not
 * escape `</script>`: every `<`, `>`, `&` and line separator becomes a \\u escape,
 * which is still valid JSON and can never close the script element.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** One-line plain text for short fields (author, city, category): no markup, no control chars. */
export function cleanShortField(input: string | undefined, max = 200): string | undefined {
  if (typeof input !== 'string') return undefined;
  const text = toPlainText(input).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? truncate(text, max) : undefined;
}

export function firstLine(input: string, max = 120): string {
  const line = input.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  return truncate(line, max);
}

export function sanitizeUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function slugify(input: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return input
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Normalizes IT tech tokens with special characters (C++, C#, .NET, 1C, etc.)
 * so that full-text search tokenizers (to_tsvector) and morphology stemmers
 * do not strip punctuation or discard them as single letters.
 */
export function normalizeTechTokens(input: string): string {
  if (!input) return '';
  return input
    .replace(/(^|[^a-zA-Z0-9_])c\+\+(?=[^a-zA-Z0-9_]|$)/gi, '$1cpp_tech')
    .replace(/(^|[^a-zA-Z0-9_])c#(?=[^a-zA-Z0-9_]|$)/gi, '$1csharp_tech')
    .replace(/(^|[^a-zA-Z0-9_])f#(?=[^a-zA-Z0-9_]|$)/gi, '$1fsharp_tech')
    .replace(/(^|[^a-zA-Z0-9_])\.net(?=[^a-zA-Z0-9_]|$)/gi, '$1dotnet_tech')
    .replace(/(^|[^a-zA-Z0-9_])dot\s*net(?=[^a-zA-Z0-9_]|$)/gi, '$1dotnet_tech')
    .replace(/(^|[^a-zA-Z0-9_])1[сc](?=[^a-zA-Z0-9_]|$)/gi, '$1onec_tech')
    .replace(/(^|[^a-zA-Z0-9_])node(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nodejs_tech')
    .replace(/(^|[^a-zA-Z0-9_])next(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nextjs_tech')
    .replace(/(^|[^a-zA-Z0-9_])nuxt(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nuxtjs_tech')
    .replace(/(^|[^a-zA-Z0-9_])vue(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1vuejs_tech')
    .replace(/(^|[^a-zA-Z0-9_])nest(?:\.js|js)(?=[^a-zA-Z0-9_]|$)/gi, '$1nestjs_tech')
    .replace(/(^|[^a-zA-Z0-9_])golang(?=[^a-zA-Z0-9_]|$)/gi, '$1golang_tech');
}

