/**
 * openradar extension: client-side X-Ray dork generator and persona mapper.
 * Generates Boolean search queries to locate hiring managers directly in the user's browser.
 */

function cleanCompanyName(raw) {
  if (!raw) return '';
  let name = String(raw).trim();

  if (/^https?:\/\//i.test(name)) {
    try {
      const hostname = new URL(name).hostname.replace(/^www\./i, '');
      name = hostname.split('.')[0] || hostname;
    } catch {}
  }

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

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;

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

  name = name.replace(/^["'«»“”„]+|["'«»“”„.,]+$/g, '').trim();
  return name || String(raw).trim();
}

function categorizePersonas(title, skills = []) {
  const titleText = (title || '').toLowerCase();
  const skillsText = (skills || []).join(' ').toLowerCase();
  const haystack = `${titleText} ${skillsText}`.trim();

  // 1. QA / Testing
  if (/\b(?:qa|тестиров|quality assurance|sdet|test lead|автотест)\b/i.test(titleText) ||
      (/\b(?:qa|sdet|quality assurance)\b/i.test(skillsText) && !/\b(?:backend|frontend)\b/i.test(titleText))) {
    return {
      category: 'qa',
      personas: ['QA Lead', 'Head of QA', 'Test Lead', 'Quality Lead', 'Engineering Manager'],
    };
  }

  // 2. Infrastructure / DevOps / SRE
  if (/\b(?:devops|sre|infrastructure|platform|инфраструктур|sysadmin|сисадмин)\b/i.test(titleText) ||
      (/\b(?:devops|sre|kubernetes|k8s|terraform)\b/i.test(skillsText) && !/\b(?:backend|frontend)\b/i.test(titleText))) {
    return {
      category: 'infrastructure',
      personas: ['Head of Infrastructure', 'DevOps Lead', 'SRE Lead', 'Platform Lead', 'VP of Engineering', 'CTO'],
    };
  }

  // 3. Design
  if (/\b(?:design[a-z]*|дизайн[а-я]*|ui\/ux|ux|figma|product design)\b/i.test(titleText) ||
      /\b(?:figma|ui\/ux|sketch)\b/i.test(skillsText)) {
    return {
      category: 'design',
      personas: ['Design Director', 'Head of Design', 'Lead Product Designer', 'Chief Design Officer', 'Art Director'],
    };
  }

  // 4. Product
  if (/\b(?:product manager|продакт|head of product|cpo|project manager)\b/i.test(titleText)) {
    return {
      category: 'product',
      personas: ['Chief Product Officer', 'CPO', 'Head of Product', 'Lead Product Manager', 'VP of Product'],
    };
  }

  // 5. Data / ML / AI
  if (/\b(?:data|ml|ai|machine learning|nlp|cv|computer vision|аналитик|analytics|bi)\b/i.test(titleText) ||
      /\b(?:pytorch|tensorflow|machine learning|data science)\b/i.test(skillsText)) {
    return {
      category: 'data_ml',
      personas: ['Head of Data', 'Lead Data Scientist', 'ML Lead', 'Chief Data Officer', 'Head of AI', 'Analytics Lead'],
    };
  }

  // 6. Mobile
  if (/\b(?:mobile|ios|android|flutter|swift|swiftui|react native)\b/i.test(titleText) ||
      /\b(?:ios|android|flutter|swift|swiftui)\b/i.test(skillsText)) {
    return {
      category: 'mobile',
      personas: ['Mobile Lead', 'iOS Lead', 'Android Lead', 'Head of Mobile', 'Team Lead', 'Engineering Manager', 'CTO'],
    };
  }

  // 7. Frontend / Web
  if (/\b(?:frontend|фронтенд|web)\b/i.test(titleText) ||
      (/\b(?:react|vue|angular|svelte|nextjs)\b/i.test(haystack) && !/\b(?:backend|python|golang|java)\b/i.test(titleText))) {
    return {
      category: 'frontend',
      personas: ['Frontend Lead', 'Head of Frontend', 'Lead Frontend', 'Team Lead', 'Engineering Manager', 'CTO'],
    };
  }

  // 8. Go / Golang
  if (/\b(?:golang|go)\b/i.test(haystack)) {
    return {
      category: 'golang',
      personas: ['Go Lead', 'Golang Lead', 'Backend Lead', 'Team Lead', 'Head of Backend', 'Engineering Manager', 'CTO'],
    };
  }

  // 9. Python
  if (/\b(?:python|django|fastapi|flask)\b/i.test(haystack)) {
    return {
      category: 'python',
      personas: ['Python Lead', 'Backend Lead', 'Team Lead', 'Head of Backend', 'Engineering Manager', 'CTO'],
    };
  }

  // 10. JVM / Java / Kotlin
  if (/\b(?:java|kotlin|spring|jvm)\b/i.test(haystack)) {
    return {
      category: 'jvm',
      personas: ['Java Lead', 'Kotlin Lead', 'Backend Lead', 'Team Lead', 'Head of Backend', 'Engineering Manager', 'CTO'],
    };
  }

  return {
    category: 'engineering',
    personas: ['Team Lead', 'Tech Lead', 'Engineering Manager', 'Head of Engineering', 'VP of Engineering', 'CTO'],
  };
}

function searchUrl(engine, query) {
  if (engine === 'yandex') {
    return `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildPersonaDisjunction(personas) {
  if (!personas || !personas.length) return '';
  return `(${personas.map((p) => `"${p}"`).join(' OR ')})`;
}

const DORK_TITLES = {
  ru: { linkedin: 'LinkedIn: Тимлиды и CTO', telegram: 'Telegram: Чаты и спикеры', habr: 'Хабр: Авторы статей', github: 'GitHub: Разработчики' },
  en: { linkedin: 'LinkedIn: team leads and CTOs', telegram: 'Telegram: chats and speakers', habr: 'Habr: article authors', github: 'GitHub: developers' },
};

function buildOutreachTemplate(company, roleTitle, lang = 'ru') {
  if (lang === 'en') {
    return (
      `Hi! I saw that ${company} is growing and looking for ${roleTitle?.trim() || 'people for your open role'}.\n` +
      `My main stack: [...]. Recently I did similar work: [...].\n` +
      `Would it make sense to talk with the team directly? I can send a short CV and code samples.`
    );
  }
  const roleName = roleTitle?.trim() || 'вашу открытую позицию';
  return (
    `Привет! Видел, что вы развиваете ${company} и ищете людей на ${roleName}.\n` +
    `Мой профильный стек: [...]. Недавно реализовал схожие задачи: [...].\n` +
    `Хотел узнать, актуально ли пообщаться напрямую с командой? Могу прислать краткое резюме и примеры кода.`
  );
}

function buildXRayPlan(company, role, skills = [], lang = 'ru') {
  const clean = cleanCompanyName(company);
  const { category, personas } = categorizePersonas(role, skills);

  const personaGroup = buildPersonaDisjunction(personas);
  const companyTerm = clean ? `"${clean}"` : '';

  const linkedinQuery = `site:linkedin.com/in/ ${companyTerm} ${personaGroup}`.trim();
  const titles = DORK_TITLES[lang] ?? DORK_TITLES.en;
  const telegramWords = lang === 'ru' ? ' OR "чат" OR "команда"' : '';
  const telegramQuery = `site:t.me ${companyTerm} ("lead" OR "head" OR "team" OR "tech" OR "dev"${telegramWords})`.trim();
  const habrQuery = `site:habr.com ${companyTerm} ("лид" OR "руководитель" OR "CTO" OR "тимлид" OR "автор")`.trim();
  const githubQuery = `site:github.com ${companyTerm} ("lead" OR "team" OR "engineering")`.trim();

  return {
    company: company || '',
    cleanCompany: clean,
    category,
    personas,
    outreachTemplate: buildOutreachTemplate(clean || company, role, lang),
    dorks: [
      {
        id: 'linkedin',
        title: titles.linkedin,
        query: linkedinQuery,
        url: searchUrl('google', linkedinQuery),
        icon: 'briefcase',
      },
      {
        id: 'telegram',
        title: titles.telegram,
        query: telegramQuery,
        url: searchUrl('google', telegramQuery),
        icon: 'send',
      },
      {
        id: 'habr',
        title: titles.habr,
        query: habrQuery,
        url: searchUrl('google', habrQuery),
        icon: 'file',
      },
      {
        id: 'github',
        title: titles.github,
        query: githubQuery,
        url: searchUrl('google', githubQuery),
        icon: 'code',
      },
    ],
  };
}

if (typeof window !== 'undefined') {
  window.openRadarXRay = {
    cleanCompanyName,
    categorizePersonas,
    buildXRayPlan,
    searchUrl,
    buildOutreachTemplate,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanCompanyName,
    categorizePersonas,
    buildXRayPlan,
    searchUrl,
    buildOutreachTemplate,
  };
}
