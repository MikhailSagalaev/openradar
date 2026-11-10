import { describe, expect, it } from 'vitest';
import { classifyWorkplace, extractSkills, isRemoteLead } from '../src/core/text.ts';
import { classifyRole } from '../src/research/derive.ts';

describe('classifyWorkplace', () => {
  it('classifies physical on-site roles as onsite and not remote', () => {
    const courier = classifyWorkplace({
      title: 'Автокурьер X5 Доставка (Вистино, Вистино, Ижорская, 1)',
      type: 'job',
    });
    expect(courier.workplaceType).toBe('onsite');
    expect(courier.isRemote).toBe(false);

    const driver = classifyWorkplace({
      title: 'Водитель категории Е на Scania',
      city: 'Казань',
      type: 'job',
    });
    expect(driver.workplaceType).toBe('onsite');
    expect(driver.isRemote).toBe(false);

    const forklift = classifyWorkplace({
      title: 'Ночной водитель погрузчика (5 - 7 тонн)',
      city: 'Москва',
      type: 'job',
    });
    expect(forklift.workplaceType).toBe('onsite');
    expect(forklift.isRemote).toBe(false);

    const loader = classifyWorkplace({
      title: 'Грузчик на производство',
      type: 'job',
    });
    expect(loader.workplaceType).toBe('onsite');
    expect(loader.isRemote).toBe(false);

    const cook = classifyWorkplace({
      title: 'Повар-сушист в ресторан',
      city: 'Санкт-Петербург',
      type: 'job',
    });
    expect(cook.workplaceType).toBe('onsite');
    expect(cook.isRemote).toBe(false);

    const cleaner = classifyWorkplace({
      title: 'Уборщик производственных и служебных помещений',
      type: 'job',
    });
    expect(cleaner.workplaceType).toBe('onsite');
    expect(cleaner.isRemote).toBe(false);
  });

  it('detects false positive remote keywords on physical roles', () => {
    const taxi = classifyWorkplace({
      title: 'Водитель на авто компании',
      text: 'Быстрое удаленное подключение к парку за 10 минут, ежедневные выплаты.',
      type: 'job',
    });
    expect(taxi.workplaceType).toBe('onsite');
    expect(taxi.isRemote).toBe(false);

    const dentist = classifyWorkplace({
      title: 'Врач стоматолог-хирург',
      text: 'Обязанности: безболезненное удаление зубов любой сложности.',
      type: 'job',
    });
    expect(dentist.workplaceType).toBe('onsite');
    expect(dentist.isRemote).toBe(false);
  });

  it('allows desk coordinators and dispatchers to be remote when specified', () => {
    const dispatcher = classifyWorkplace({
      title: 'Диспетчер курьерской службы',
      text: 'Полная удаленка, работа из дома, прием и распределение заказов.',
      type: 'job',
    });
    expect(dispatcher.workplaceType).toBe('remote');
    expect(dispatcher.isRemote).toBe(true);

    const logist = classifyWorkplace({
      title: 'Логист-координатор водителей',
      text: 'Удаленный формат работы, координация рейсов по РФ.',
      type: 'job',
    });
    expect(logist.workplaceType).toBe('remote');
    expect(logist.isRemote).toBe(true);
  });

  it('detects negation of remote work', () => {
    const dev = classifyWorkplace({
      title: 'Senior C++ Developer',
      text: 'Работа только в офисе в Москве. Кандидатов на удаленку не рассматриваем.',
      type: 'job',
    });
    expect(dev.workplaceType).toBe('onsite');
    expect(dev.isRemote).toBe(false);
  });

  it('detects hybrid workplace arrangement', () => {
    const hybrid = classifyWorkplace({
      title: 'Product Manager',
      text: 'Формат работы: гибрид (3 дня в офисе, 2 дня из дома).',
      city: 'Москва',
      type: 'job',
    });
    expect(hybrid.workplaceType).toBe('hybrid');
    expect(hybrid.isRemote).toBe(false);

    const hybridSlash = classifyWorkplace({
      title: 'UI/UX Designer',
      text: 'Офис / удаленка, периодические встречи команды в коворкинге.',
      type: 'job',
    });
    expect(hybridSlash.workplaceType).toBe('hybrid');
    expect(hybridSlash.isRemote).toBe(false);
  });

  it('detects pure remote jobs', () => {
    const remote = classifyWorkplace({
      title: 'Go Backend Engineer',
      text: 'Удаленная работа из любой точки мира. Предоставляем технику.',
      type: 'job',
    });
    expect(remote.workplaceType).toBe('remote');
    expect(remote.isRemote).toBe(true);

    const onlineCity = classifyWorkplace({
      title: 'QA Automation Engineer',
      text: 'Тестирование веб-приложений на Python.',
      city: 'Онлайн',
      type: 'job',
    });
    expect(onlineCity.workplaceType).toBe('remote');
    expect(onlineCity.isRemote).toBe(true);

    const teamLead = classifyWorkplace({
      title: 'Руководитель группы разработки',
      text: 'Полная удаленка из любой точки мира.',
      type: 'job',
    });
    expect(teamLead.workplaceType).toBe('remote');
    expect(teamLead.isRemote).toBe(true);
  });

  it('applies type-based defaults when no markers are present', () => {
    // Vacancy without city or remote keywords is onsite by default
    const plainJob = classifyWorkplace({
      title: 'Системный аналитик',
      text: 'Сбор требований, составление ТЗ, проектирование моделей данных.',
      type: 'job',
    });
    expect(plainJob.workplaceType).toBe('onsite');
    expect(plainJob.isRemote).toBe(false);

    // Freelance digital gig without city is remote by default
    const plainGig = classifyWorkplace({
      title: 'Сверстать лендинг по макету в Figma',
      text: 'HTML, CSS, адаптив под мобильные.',
      type: 'gig',
    });
    expect(plainGig.workplaceType).toBe('remote');
    expect(plainGig.isRemote).toBe(true);
  });

  it('isRemoteLead respects boolean and workplaceType', () => {
    expect(isRemoteLead({ title: 'Водитель', text: '', isRemote: false })).toBe(false);
    expect(isRemoteLead({ title: 'Разработчик', text: '', isRemote: true })).toBe(true);
    expect(isRemoteLead({ title: 'Дизайнер', text: '', workplaceType: 'hybrid' })).toBe(false);
    expect(isRemoteLead({ title: 'Курьер', text: '' })).toBe(false);
  });
  it('keeps hybrid arrangement even when an adapter passes explicitRemote: false', () => {
    const msEng = classifyWorkplace({
      title: 'Senior Microsoft Infrastructure Engineer (Oeiras) | Hybrid',
      city: 'Oeiras',
      type: 'job',
      explicitRemote: false,
    });
    expect(msEng.workplaceType).toBe('hybrid');
    expect(msEng.isRemote).toBe(false);

    const ptHybrid = classifyWorkplace({
      title: 'Consultor de SAP MM/SD',
      text: 'Disponibilidade para trabalhar num modelo híbrido 2x por semana no Porto.',
      city: 'Porto',
      type: 'job',
      explicitRemote: false,
    });
    expect(ptHybrid.workplaceType).toBe('hybrid');
  });

  it('does not tag Pearson VUE as Vue or company talentos blurbs as HR', () => {
    const sapText = 'Unimos os nossos talentos em ERP SAP MM/SD. Damos acesso a centro de exames Pearson VUE.';
    expect(extractSkills('Consultor de SAP MM/SD', sapText)).not.toContain('Vue');
    expect(classifyRole('job', 'Consultor de SAP MM/SD', sapText)).toBe('other');
  });
});
