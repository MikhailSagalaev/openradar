/**
 * X-Ray search query builder and decision-maker discovery (radar/2).
 *
 * Generates deterministic, highly targeted Boolean search queries (Google Dorks)
 * to locate engineering leaders, team leads, and hiring managers across LinkedIn,
 * Telegram, Habr, and GitHub, bypassing generic gatekeepers and ATS filters.
 */

export interface XRayTarget {
  company: string;
  role?: string;
  skills?: string[];
  city?: string;
}

export type XRayPlatform = 'linkedin' | 'telegram' | 'habr' | 'github' | 'team';

export interface XRayDork {
  id: XRayPlatform;
  title: string;
  platform: string;
  query: string;
  googleUrl: string;
  yandexUrl: string;
  description: string;
}

export interface XRayResult {
  company: string;
  cleanCompany: string;
  roleCategory: string;
  personas: string[];
  dorks: XRayDork[];
  outreachTemplate: string;
}

/**
 * Strips legal prefixes/suffixes, corporate forms, quotes, and web domain noise.
 * Examples:
 *   'ООО "Яндекс.Крауд"' -> 'Яндекс.Крауд'
 *   'Acme Corp, Inc.' -> 'Acme'
 *   'https://mindbox.cloud/careers' -> 'mindbox'
 */
export function cleanCompanyName(raw: string): string {
  if (!raw) return '';
  let name = String(raw).trim();

  // If a URL was passed as company name
  if (/^https?:\/\//i.test(name)) {
    try {
      const hostname = new URL(name).hostname.replace(/^www\./i, '');
      name = hostname.split('.')[0] || hostname;
    } catch {}
  }

  // Strip common Russian & International corporate abbreviations
  const legalPrefixes = [
    /^(?:ооо|зао|оао|пао|ао|ип|нко)\s+/iu,
    /^(?:llc|ltd|inc|corp|co\.|co|gmbh)\s+/iu,
    /^(?:компания|студия|агентство|холдинг|группа\s+компаний)\s+/iu,
  ];

  const legalSuffixes = [
    /[,.\s]+(?:ооо|зао|оао|пао|ао|ип|нко)[,.\s]*$/iu,
    /[,.\s]+(?:llc|ltd|inc|corp|co\.|co|gmbh|sa|bv|s\.r\.o\.?)[,.\s]*$/iu,
    /[,.\s]+(?:russia|россия|cis|снг)[,.\s]*$/iu,
  ];

  // Clean iteratively (e.g. "Acme Corp, Inc." -> "Acme Corp" -> "Acme")
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;

    // Remove quotes and punctuation at edges
    const unquoted = name.replace(/^["'«»“”„]+|["'«»“”„.,]+$/g, '').trim();
    if (unquoted !== name) {
      name = unquoted;
      changed = true;
    }

    for (const re of legalPrefixes) {
      const updated = name.replace(re, '').trim();
      if (updated !== name && updated.length > 0) {
        name = updated;
        changed = true;
      }
    }
    for (const re of legalSuffixes) {
      const updated = name.replace(re, '').trim();
      if (updated !== name && updated.length > 0) {
        name = updated;
        changed = true;
      }
    }
  }

  // Final trim of quotes/dots
  name = name.replace(/^["'«»“”„]+|["'«»“”„.,]+$/g, '').trim();

  return name || raw.trim();
}

export interface PersonaMapping {
  category: string;
  personas: string[];
}

/**
 * Maps a job title and skill list to the most relevant leadership personas.
 */
export function categorizePersonas(title?: string, skills: string[] = []): PersonaMapping {
  const titleText = (title ?? '').toLowerCase();
  const skillsText = skills.join(' ').toLowerCase();
  const haystack = `${titleText} ${skillsText}`.trim();

  // Word edges are Unicode lookarounds: \b only knows ASCII letters, so it never fires
  // around «Тестировщик» or «Дизайнер». Russian stems take any ending.

  // Functional specializations take precedence over generic language skills
  // (e.g. QA Automation in Python -> QA Lead, not Python Lead)

  // 1. QA / Testing
  if (/(?<![\p{L}\p{N}])(?:qa|тестиров\p{L}*|quality assurance|sdet|test lead|автотест\p{L}*)(?![\p{L}\p{N}])/iu.test(titleText) ||
      (/(?<![\p{L}\p{N}])(?:qa|sdet|quality assurance)(?![\p{L}\p{N}])/iu.test(skillsText) && !/(?<![\p{L}\p{N}])(?:backend|frontend)(?![\p{L}\p{N}])/iu.test(titleText))) {
    return {
      category: 'qa',
      personas: ['QA Lead', 'Head of QA', 'Test Lead', 'Quality Lead', 'Engineering Manager'],
    };
  }

  // 2. Infrastructure / DevOps / SRE
  if (/(?<![\p{L}\p{N}])(?:devops|sre|infrastructure|platform|инфраструктур\p{L}*|sysadmin|сисадмин\p{L}*)(?![\p{L}\p{N}])/iu.test(titleText) ||
      /(?<![\p{L}\p{N}])(?:devops|sre|kubernetes|k8s|terraform)(?![\p{L}\p{N}])/iu.test(skillsText) && !/(?<![\p{L}\p{N}])(?:backend|frontend)(?![\p{L}\p{N}])/iu.test(titleText)) {
    return {
      category: 'infrastructure',
      personas: ['Head of Infrastructure', 'DevOps Lead', 'SRE Lead', 'Platform Lead', 'VP of Engineering', 'CTO'],
    };
  }

  // 3. Design
  if (/(?<![\p{L}\p{N}])(?:design[a-z]*|дизайн[а-я]*|ui\/ux|ux|figma|product design)(?![\p{L}\p{N}])/iu.test(titleText) ||
      /(?<![\p{L}\p{N}])(?:figma|ui\/ux|sketch)(?![\p{L}\p{N}])/iu.test(skillsText)) {
    return {
      category: 'design',
      personas: ['Design Director', 'Head of Design', 'Lead Product Designer', 'Chief Design Officer', 'Art Director'],
    };
  }

  // 4. Product
  if (/(?<![\p{L}\p{N}])(?:product manager|продакт\p{L}*|head of product|cpo|project manager)(?![\p{L}\p{N}])/iu.test(titleText)) {
    return {
      category: 'product',
      personas: ['Chief Product Officer', 'CPO', 'Head of Product', 'Lead Product Manager', 'VP of Product'],
    };
  }

  // 5. Data / ML / AI
  if (/(?<![\p{L}\p{N}])(?:data|ml|ai|machine learning|nlp|cv|computer vision|аналитик\p{L}*|analytics|bi)(?![\p{L}\p{N}])/iu.test(titleText) ||
      /(?<![\p{L}\p{N}])(?:pytorch|tensorflow|machine learning|data science)(?![\p{L}\p{N}])/iu.test(skillsText)) {
    return {
      category: 'data_ml',
      personas: ['Head of Data', 'Lead Data Scientist', 'ML Lead', 'Chief Data Officer', 'Head of AI', 'Analytics Lead'],
    };
  }

  // 6. Mobile
  if (/(?<![\p{L}\p{N}])(?:mobile|ios|android|flutter|swift|swiftui|react native)(?![\p{L}\p{N}])/iu.test(titleText) ||
      /(?<![\p{L}\p{N}])(?:ios|android|flutter|swift|swiftui)(?![\p{L}\p{N}])/iu.test(skillsText)) {
    return {
      category: 'mobile',
      personas: ['Mobile Lead', 'iOS Lead', 'Android Lead', 'Head of Mobile', 'Team Lead', 'Engineering Manager', 'CTO'],
    };
  }

  // 7. Frontend / Web
  if (/(?<![\p{L}\p{N}])(?:frontend|фронтенд\p{L}*|web)(?![\p{L}\p{N}])/iu.test(titleText) ||
      (/(?<![\p{L}\p{N}])(?:react|vue|angular|svelte|nextjs)(?![\p{L}\p{N}])/iu.test(haystack) && !/(?<![\p{L}\p{N}])(?:backend|python|golang|java)(?![\p{L}\p{N}])/iu.test(titleText))) {
    return {
      category: 'frontend',
      personas: ['Frontend Lead', 'Head of Frontend', 'Lead Frontend', 'Team Lead', 'Engineering Manager', 'CTO'],
    };
  }

  // 8. Go / Golang
  if (/(?<![\p{L}\p{N}])(?:golang|go)(?![\p{L}\p{N}])/iu.test(haystack)) {
    return {
      category: 'golang',
      personas: ['Go Lead', 'Golang Lead', 'Backend Lead', 'Team Lead', 'Head of Backend', 'Engineering Manager', 'CTO'],
    };
  }

  // 9. Python
  if (/(?<![\p{L}\p{N}])(?:python|django|fastapi|flask)(?![\p{L}\p{N}])/iu.test(haystack)) {
    return {
      category: 'python',
      personas: ['Python Lead', 'Backend Lead', 'Team Lead', 'Head of Backend', 'Engineering Manager', 'CTO'],
    };
  }

  // 10. JVM / Java / Kotlin
  if (/(?<![\p{L}\p{N}])(?:java|kotlin|spring|jvm)(?![\p{L}\p{N}])/iu.test(haystack)) {
    return {
      category: 'jvm',
      personas: ['Java Lead', 'Kotlin Lead', 'Backend Lead', 'Team Lead', 'Head of Backend', 'Engineering Manager', 'CTO'],
    };
  }

  // Default: General Engineering Leadership
  return {
    category: 'engineering',
    personas: ['Team Lead', 'Tech Lead', 'Engineering Manager', 'Head of Engineering', 'VP of Engineering', 'CTO'],
  };
}

export function searchUrl(engine: 'google' | 'yandex', query: string): string {
  if (engine === 'yandex') {
    return `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Builds the Boolean expression for personas, e.g.
 * ("Team Lead" OR "Tech Lead" OR "CTO")
 */
function buildPersonaDisjunction(personas: string[]): string {
  if (!personas.length) return '';
  return `(${personas.map((p) => `"${p}"`).join(' OR ')})`;
}

/**
 * Generates cold outreach message template tailored to role and company.
 */
export function buildOutreachTemplate(company: string, roleTitle?: string): string {
  const roleName = roleTitle?.trim() || 'вашу открытую позицию';
  return (
    `Привет! Видел, что вы развиваете ${company} и ищете людей на ${roleName}.\n` +
    `Мой профильный стек: [...]. Недавно реализовал схожие задачи: [...].\n` +
    `Хотел узнать, актуально ли пообщаться напрямую с командой? Могу прислать краткое резюме и примеры кода.`
  );
}

/**
 * Main entry point: builds all X-Ray dorks and metadata for a target vacancy.
 */
export function buildXRayResult(target: XRayTarget): XRayResult {
  const cleanCompany = cleanCompanyName(target.company);
  const { category, personas } = categorizePersonas(target.role, target.skills);

  const personaGroup = buildPersonaDisjunction(personas);
  const companyTerm = cleanCompany ? `"${cleanCompany}"` : '';

  // 1. LinkedIn Dork: targeting personal profile pages
  const linkedinQuery = `site:linkedin.com/in/ ${companyTerm} ${personaGroup}`.trim();

  // 2. Telegram Dork: public channels, chats, and lead mentions
  const telegramQuery = `site:t.me ${companyTerm} ("lead" OR "head" OR "team" OR "tech" OR "dev" OR "чат" OR "команда")`.trim();

  // 3. Habr Dork: company tech articles and author profiles
  const habrQuery = `site:habr.com ${companyTerm} ("лид" OR "руководитель" OR "CTO" OR "тимлид" OR "автор")`.trim();

  // 4. GitHub Dork: organization members, repos, tech stack contributors
  const githubQuery = `site:github.com ${companyTerm} ("lead" OR "team" OR "engineering")`.trim();

  // 5. Company Team Page: about / team / leadership pages
  const teamQuery = `${companyTerm} ("команда" OR "о нас" OR "руководство" OR "team" OR "about us" OR "leadership")`.trim();

  const dorks: XRayDork[] = [
    {
      id: 'linkedin',
      title: 'LinkedIn: Руководители и тимлиды',
      platform: 'LinkedIn',
      query: linkedinQuery,
      googleUrl: searchUrl('google', linkedinQuery),
      yandexUrl: searchUrl('yandex', linkedinQuery),
      description: 'Поиск профилей Team Lead, Engineering Manager и CTO этой компании в LinkedIn',
    },
    {
      id: 'telegram',
      title: 'Telegram: Чаты и спикеры',
      platform: 'Telegram',
      query: telegramQuery,
      googleUrl: searchUrl('google', telegramQuery),
      yandexUrl: searchUrl('yandex', telegramQuery),
      description: 'Поиск профильных Telegram-каналов, технических чатов и контактов инженеров компании',
    },
    {
      id: 'habr',
      title: 'Хабр: Авторы технических статей',
      platform: 'Хабр',
      query: habrQuery,
      googleUrl: searchUrl('google', habrQuery),
      yandexUrl: searchUrl('yandex', habrQuery),
      description: 'Статьи инженеров компании на Хабре с указанием авторов, должностей и ссылок на соцсети',
    },
    {
      id: 'github',
      title: 'GitHub: Разработчики и контрибьюторы',
      platform: 'GitHub',
      query: githubQuery,
      googleUrl: searchUrl('google', githubQuery),
      yandexUrl: searchUrl('yandex', githubQuery),
      description: 'Организация компании на GitHub и ведущие разработчики репозиториев',
    },
    {
      id: 'team',
      title: 'Сайт: Страница команды',
      platform: 'Web',
      query: teamQuery,
      googleUrl: searchUrl('google', teamQuery),
      yandexUrl: searchUrl('yandex', teamQuery),
      description: 'Поиск публичной страницы команды, основателей и ключевых сотрудников на сайте компании',
    },
  ];

  return {
    company: target.company,
    cleanCompany,
    roleCategory: category,
    personas,
    dorks,
    outreachTemplate: buildOutreachTemplate(cleanCompany || target.company, target.role),
  };
}
