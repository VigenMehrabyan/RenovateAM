import type { ChatEntry, ServiceEntries } from './types';

/**
 * База знаний чат-бота. ДАННЫЕ, не логика: здесь нет ни одного `if`.
 *
 * Русские формулировки утверждены заказчиком 21.10.2026 (черновик
 * `chat-baza-znaniy-draft.md`). Менять их можно только с его ведома — бот
 * говорит от лица компании о деньгах, сроках и гарантии.
 *
 * Файл редактирует команда базы знаний. Движок поиска и контроллеры его
 * импортируют, но не правят: иначе данные и логика расползутся по репозиторию.
 */

/** Служебные реплики. По ним не ищут — их выдаёт сам движок. */
export const SERVICE_ENTRIES: ServiceEntries = {
  greeting: {
    id: 'greeting',
    topic: 'Приветствие',
    label: { ru: 'Приветствие', hy: 'Ողջույն', en: 'Greeting' },
    keywords: { ru: [], hy: [], hyLatin: [], en: [] },
    answer: {
      ru: 'Здравствуйте! Я помощник RenovateAM. Отвечу про цены, сроки и состав работ — спрашивайте своими словами.',
      hy: 'Բարև Ձեզ։ Ես RenovateAM-ի օգնականն եմ։ Կպատասխանեմ գների, ժամկետների և աշխատանքների կազմի մասին՝ հարցրեք Ձեր բառերով։',
      en: "Hello! I'm the RenovateAM assistant. Ask me about prices, timelines and what the work includes — in your own words.",
    },
    actions: ['ESTIMATE'],
  },
  contacts_request: {
    id: 'contacts_request',
    topic: 'Просьба оставить контакты',
    label: { ru: 'Контакты', hy: 'Կոնտակտներ', en: 'Contacts' },
    keywords: { ru: [], hy: [], hyLatin: [], en: [] },
    answer: {
      ru: 'Чтобы продолжить разговор, оставьте, пожалуйста, имя, телефон и почту. Это нужно, чтобы менеджер мог связаться с вами, если вопрос окажется сложнее, чем может бот.',
      hy: 'Զրույցը շարունակելու համար խնդրում ենք թողնել Ձեր անունը, հեռախոսահամարը և էլ. փոստը։ Դա պետք է, որպեսզի մենեջերը կարողանա կապվել Ձեզ հետ, եթե հարցը բոտի ուժերից վեր լինի։',
      en: 'To continue, please leave your name, phone and email. We need them so a manager can reach you if the question turns out to be beyond the bot.',
    },
  },
  contacts_thanks: {
    id: 'contacts_thanks',
    topic: 'Контакты сохранены',
    label: { ru: 'Спасибо', hy: 'Շնորհակալություն', en: 'Thanks' },
    keywords: { ru: [], hy: [], hyLatin: [], en: [] },
    answer: {
      ru: 'Спасибо, записал. Спрашивайте дальше.',
      hy: 'Շնորհակալություն, գրանցեցի։ Շարունակեք հարցերը։',
      en: 'Thank you, saved. Ask away.',
    },
  },
  fallback: {
    id: 'fallback',
    topic: 'Вопрос не распознан',
    label: { ru: 'Не понял вопрос', hy: 'Չհասկացա', en: 'Not understood' },
    keywords: { ru: [], hy: [], hyLatin: [], en: [] },
    answer: {
      ru: 'Не уверен, что правильно понял вопрос, — не хочу гадать там, где речь о ваших деньгах. Могу позвать человека: он ответит точно. Или спросите иначе, попробую ещё раз.',
      hy: 'Վստահ չեմ, որ ճիշտ հասկացա հարցը, իսկ երբ խոսքը Ձեր գումարի մասին է, գուշակել չեմ ուզում։ Կարող եմ կանչել մեր մասնագետին, կամ փորձեք ձևակերպել այլ կերպ։',
      en: "I'm not sure I understood you, and I'd rather not guess when it's about your money. I can get a human to answer, or you can put the question differently.",
    },
    actions: ['HUMAN'],
  },
  clarify: {
    id: 'clarify',
    topic: 'Уточняющий вопрос при двух близких темах',
    label: { ru: 'Уточнение', hy: 'Ճշտում', en: 'Clarification' },
    keywords: { ru: [], hy: [], hyLatin: [], en: [] },
    answer: {
      ru: 'Уточните, пожалуйста: вас интересует {{a}} или {{b}}?',
      hy: 'Խնդրում եմ ճշտել՝ Ձեզ հետաքրքրում է {{a}}, թե՞ {{b}}։',
      en: 'Could you clarify: are you asking about {{a}} or {{b}}?',
    },
  },
  handoff_done: {
    id: 'handoff_done',
    topic: 'Запрос на живого человека принят',
    label: { ru: 'Позвать человека', hy: 'Կանչել մասնագետի', en: 'Call a human' },
    keywords: { ru: [], hy: [], hyLatin: [], en: [] },
    answer: {
      ru: 'Передал менеджеру — он свяжется с вами в рабочее время. Если удобнее позвонить самому: +374 99 099 457.',
      hy: 'Փոխանցեցի մենեջերին՝ նա կկապվի Ձեզ հետ աշխատանքային ժամերին։ Կարող եք նաև ինքներդ զանգահարել՝ +374 99 099 457։',
      en: "I've passed this to our manager — they'll get in touch during working hours. You can also call us: +374 99 099 457.",
    },
    actions: ['CALL'],
  },
};

/**
 * Темы базы знаний: 39 тем из `docs/chat-knowledge-base-ru.md` (п. 1–39).
 * Сороковая тема источника — «не знаю ответа» — живёт в `SERVICE_ENTRIES.fallback`:
 * по ней не ищут, её выдаёт движок, когда ни одна тема не прошла порог.
 *
 * Русские формулировки перенесены из источника без переписывания. Армянский —
 * восточноармянская литературная норма, вежливое «Դուք»; английский — нейтральный.
 * Суммы, проценты, сроки, телефон и ссылки одинаковы во всех трёх языках.
 */
export const CHAT_ENTRIES: ChatEntry[] = [
  {
    id: 'price_per_sqm',
    topic: 'Сколько стоит ремонт за квадратный метр',
    label: { ru: 'Цена за метр', hy: 'Գինը մեկ մետրի համար', en: 'Price per square meter' },
    keywords: {
      ru: ['цена', 'стоимость', 'сколько стоит', 'прайс', 'за метр', 'за квадрат'],
      hy: ['գին', 'արժե', 'քառակուսի մետր'],
      hyLatin: ['gin', 'inch arji', 'qarakusi metr', 'mek metry'],
      en: ['price', 'cost', 'per square meter', 'how much'],
    },
    answer: {
      ru: 'Базовая ставка стандартного пакета — 60 000 драм за 1 м². Итог зависит ещё от объёма работ, типа объекта, состояния помещения и высоты потолков. Назовите площадь и что нужно сделать — посчитаю вашу вилку прямо здесь.',
      hy: 'Ստանդարտ փաթեթի բազային դրույքը՝ 60 000 դրամ 1 մ²-ի համար։ Վերջնական գումարը կախված է նաև աշխատանքների ծավալից, օբյեկտի տեսակից, տարածքի վիճակից և առաստաղի բարձրությունից։ Նշեք մակերեսը և ինչ է պետք անել՝ կհաշվեմ Ձեր միջակայքը հենց այստեղ։',
      en: 'The base rate for the standard package is 60,000 AMD per 1 m². The final figure also depends on the scope of work, the type of property, its condition and ceiling height. Tell me the area and what needs doing — I’ll work out your range right here.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'calculate_for_me',
    topic: 'Посчитайте мне цену',
    label: { ru: 'Посчитать цену', hy: 'Հաշվել գինը', en: 'Calculate the price' },
    keywords: {
      ru: ['посчитай', 'посчитайте', 'расчёт', 'рассчитать', 'калькулятор', 'посчитать стоимость'],
      hy: ['հաշվիր', 'հաշվարկ', 'հաշվեք'],
      hyLatin: ['hashvir', 'hashvark', 'hashvek', 'hashvi gin'],
      en: ['calculate', 'estimate', 'calculate price'],
    },
    answer: {
      ru: 'Давайте. Какая площадь в квадратных метрах?',
      hy: 'Եկեք հաշվենք։ Քանի՞ քառակուսի մետր է տարածքը։',
      en: 'Sure. What is the area in square meters?',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'price_breakdown',
    topic: 'Откуда берётся цена',
    label: { ru: 'Откуда цена', hy: 'Ինչից է կազմվում գինը', en: 'How the price is built' },
    keywords: {
      ru: [
        'откуда цена',
        'как считаете',
        'из чего складывается',
        'почему столько',
        'как формируется цена',
      ],
      hy: ['ինչպես եք հաշվում', 'ինչից է կազմվում', 'ինչու այդքան'],
      hyLatin: ['inchpes ek hashvum', 'inchits e kazmvum', 'inchu aydqan'],
      en: ['how do you calculate', 'how is the price formed', 'why so much'],
    },
    answer: {
      ru: 'Базовая ставка за м² умножается на четыре коэффициента: объём работ, тип объекта, состояние помещения и высота потолков. Вилка — минус и плюс 15 % от полученной суммы, потому что до выезда точную сумму не назовёт никто.',
      hy: 'Մեկ մ²-ի բազային դրույքը բազմապատկվում է չորս գործակցով՝ աշխատանքների ծավալ, օբյեկտի տեսակ, տարածքի վիճակ և առաստաղի բարձրություն։ Միջակայքը ստացված գումարի մինուս և պլյուս 15 %-ն է, որովհետև մինչև տեղում զննումը ճշգրիտ գումարը ոչ ոք չի ասի։',
      en: 'The base rate per m² is multiplied by four factors: the scope of work, the type of property, the condition of the space and the ceiling height. The range is minus and plus 15 % of that figure, because nobody can name an exact sum before seeing the site.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'price_range_reason',
    topic: 'Почему вилка, а не точная сумма',
    label: { ru: 'Почему вилка', hy: 'Ինչու միջակայք', en: 'Why a range' },
    keywords: {
      ru: ['вилка', 'диапазон', 'точная цена', 'почему от и до', 'почему не точно'],
      hy: ['միջակայք', 'ճշգրիտ գին', 'ինչու մոտավոր'],
      hyLatin: ['chisht gin', 'mijakayq', 'chshgrit gin', 'inchu motavor'],
      en: ['exact price', 'range', 'why a range', 'why not exact'],
    },
    answer: {
      ru: 'Это предварительная оценка по шести параметрам, без осмотра объекта. Точную сумму сметчик считает после замера — по позициям и по тем же ставкам. Расхождение в большую сторону без вашего согласия не появляется.',
      hy: 'Սա նախնական գնահատում է վեց պարամետրով՝ առանց օբյեկտի զննման։ Ճշգրիտ գումարը նախահաշվարկողը հաշվում է չափագրումից հետո՝ ըստ դիրքերի և նույն դրույքներով։ Առանց Ձեր համաձայնության գումարը վերև չի գնում։',
      en: 'This is a preliminary estimate based on six parameters, without an inspection of the property. The exact figure is worked out by our estimator after the measurement — item by item and at the same rates. It never goes up without your agreement.',
    },
    actions: ['REQUEST'],
  },
  {
    id: 'area_mismatch',
    topic: 'Что если площадь не совпадёт с фактической',
    label: { ru: 'Площадь не совпала', hy: 'Մակերեսը չի համընկնում', en: 'Area mismatch' },
    keywords: {
      ru: ['площадь не совпала', 'обмер', 'фактическая площадь', 'другая площадь'],
      hy: ['տարածք', 'փաստացի մակերես', 'մակերեսը չի համընկնում'],
      hyLatin: ['tarats', 'pastaci makeres', 'makeresy chi hamynknum'],
      en: ['area mismatch', 'actual area', 'wrong area'],
    },
    answer: {
      ru: 'Расчёт предварительный. После замера площадь уточняется, и смета пересчитывается по тем же ставкам — пересогласовывать условия заново не нужно.',
      hy: 'Հաշվարկը նախնական է։ Չափագրումից հետո մակերեսը ճշտվում է, և նախահաշիվը վերահաշվարկվում է նույն դրույքներով՝ պայմանները նորից համաձայնեցնել պետք չէ։',
      en: 'The calculation is preliminary. After the measurement the area is confirmed and the quote is recalculated at the same rates — there is no need to agree the terms all over again.',
    },
  },
  {
    id: 'not_included',
    topic: 'Что не входит в расчёт',
    label: { ru: 'Что не входит', hy: 'Ինչը չի մտնում', en: 'What is not included' },
    keywords: {
      ru: ['что не входит', 'не включено', 'дополнительно'],
      hy: ['ինչ չի մտնում', 'ներառված չէ', 'լրացուցիչ'],
      hyLatin: ['inch chi mtnum', 'nerarvats che', 'lracucich'],
      en: ['not included', 'what is not included', 'extra'],
    },
    answer: {
      ru: 'Мебель, кухня, шкафы и бытовая техника — это обстановка, мы её не продаём и не считаем. Дизайнерские решения, нетиповые материалы, перепланировку и согласования сметчик считает отдельно от базовой ставки.',
      hy: 'Կահույքը, խոհանոցը, պահարանները և կենցաղային տեխնիկան կահավորում են՝ մենք դրանք չենք վաճառում և չենք հաշվում։ Դիզայներական լուծումները, ոչ տիպային նյութերը, վերահատակագծումը և համաձայնեցումները նախահաշվարկողը հաշվում է բազային դրույքից առանձին։',
      en: 'Furniture, the kitchen, wardrobes and household appliances are furnishing — we neither sell them nor price them. Design solutions, non-standard materials, layout changes and permits are priced by the estimator separately from the base rate.',
    },
  },
  {
    id: 'free_estimate',
    topic: 'Расчёт бесплатный',
    label: { ru: 'Расчёт бесплатный', hy: 'Հաշվարկն անվճար է', en: 'The estimate is free' },
    keywords: {
      ru: ['бесплатно', 'платно ли', 'сколько стоит расчёт', 'платный ли выезд'],
      hy: ['անվճար', 'վճարովի է', 'որքան արժե հաշվարկը'],
      hyLatin: ['anvchar', 'anvchar e', 'vcharovi e'],
      en: ['free', 'is it free', 'cost of the estimate'],
    },
    answer: {
      ru: 'Всё до начала работ бесплатно и ни к чему вас не обязывает: быстрый расчёт здесь, смета от сметчика и выезд на объект после согласования. Платите вы только за сам ремонт.',
      hy: 'Մինչև աշխատանքների մեկնարկը ամեն ինչ անվճար է և Ձեզ ոչ մի բանի չի պարտավորեցնում՝ արագ հաշվարկն այստեղ, նախահաշիվը մասնագետից և օբյեկտ այցը համաձայնեցումից հետո։ Վճարում եք միայն վերանորոգման համար։',
      en: 'Everything before the work starts is free and commits you to nothing: the quick calculation here, the detailed quote from our estimator and the visit to the property once you approve it. You only pay for the renovation itself.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'price_validity',
    topic: 'Цена меняется со временем',
    label: {
      ru: 'Срок действия цены',
      hy: 'Գնի վավերականությունը',
      en: 'How long the price holds',
    },
    keywords: {
      ru: ['действует', 'срок действия', 'подорожает', 'зафиксирована'],
      hy: ['ուժի մեջ է', 'վավերականության ժամկետ', 'կթանկանա'],
      hyLatin: ['vaveragruma', 'vaveragrum', 'kthankana', 'qani or e uzhi mej'],
      en: ['valid', 'price change', 'how long is the price valid'],
    },
    answer: {
      ru: 'Расчёт действует 30 дней. Внутри этого срока ставки для вас зафиксированы, даже если общий прайс изменится.',
      hy: 'Հաշվարկը վավեր է 30 օր։ Այդ ժամկետի ընթացքում Ձեզ համար դրույքները ֆիքսված են, նույնիսկ եթե ընդհանուր գնացուցակը փոխվի։',
      en: 'The calculation is valid for 30 days. Within that period your rates are fixed, even if our general price list changes.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'packages_overview',
    topic: 'Какие бывают пакеты',
    label: { ru: 'Пакеты работ', hy: 'Աշխատանքների փաթեթներ', en: 'Work packages' },
    keywords: {
      ru: ['пакеты', 'варианты', 'что предлагаете', 'какие пакеты'],
      hy: ['փաթեթներ', 'տարբերակներ', 'ինչ եք առաջարկում'],
      hyLatin: ['pakedner', 'tarberakner', 'inch ek arajarkum'],
      en: ['packages', 'options', 'what do you offer'],
    },
    answer: {
      ru: 'Три объёма работ: черновой, чистовой и под ключ. Отдельно — дизайнерский проект, он считается индивидуально. Рассказать подробнее про какой-то из них?',
      hy: 'Աշխատանքների երեք ծավալ՝ սև, ավարտական և բանալու հանձնում։ Առանձին՝ դիզայներական նախագիծ, որը հաշվվում է անհատապես։ Ո՞ր մեկի մասին պատմեմ ավելի մանրամասն։',
      en: 'Three scopes of work: rough, finishing and turnkey. A design project is separate and is priced individually. Would you like to hear more about one of them?',
    },
  },
  {
    id: 'turnkey_scope',
    topic: 'Что такое «под ключ»',
    label: { ru: 'Ремонт под ключ', hy: 'Բանալու հանձնում', en: 'Turnkey renovation' },
    keywords: {
      ru: ['под ключ', 'полный ремонт', 'входит ли мебель', 'кухня', 'шкаф'],
      hy: ['բանալու հանձնում', 'լրիվ վերանորոգում', 'կահույք', 'խոհանոց'],
      hyLatin: ['banali hanzhnum', 'lriv veranorogum', 'kahuyq', 'khohanots'],
      en: ['turnkey', 'full renovation', 'furniture included'],
    },
    answer: {
      ru: 'Полный цикл ремонтных работ: от черновых до финишной отделки и уборки после них. Заезжаете в готовую квартиру. Мебель, кухня, шкафы и техника в «под ключ» не входят — это уже обстановка, её вы покупаете сами.',
      hy: 'Վերանորոգման ամբողջական ցիկլ՝ սևից մինչև ավարտական հարդարում և դրանից հետո մաքրում։ Դուք մտնում եք պատրաստի բնակարան։ Կահույքը, խոհանոցը, պահարանները և տեխնիկան «բանալու հանձնման» մեջ չեն մտնում՝ դա արդեն կահավորում է, այն գնում եք ինքներդ։',
      en: 'The full cycle of renovation work: from rough works to the final finish and the clean-up after it. You move into a finished flat. Furniture, the kitchen, wardrobes and appliances are not part of a turnkey job — that is furnishing, and you buy it yourself.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'finishing_works',
    topic: 'Что такое чистовая отделка',
    label: { ru: 'Чистовая отделка', hy: 'Ավարտական հարդարում', en: 'Finishing works' },
    keywords: {
      ru: ['чистовая', 'финишная', 'чистовая отделка'],
      hy: ['ավարտական հարդարում', 'ֆինիշային'],
      hyLatin: ['avartakan hardarum', 'finishayin', 'chistovoy'],
      en: ['finishing', 'finishing works', 'final finish'],
    },
    answer: {
      ru: 'Финишные покрытия, двери и сантехника на уже подготовленных поверхностях. Подходит, если черновые работы сделаны.',
      hy: 'Ավարտական ծածկույթներ, դռներ և սանտեխնիկա՝ արդեն պատրաստված մակերեսների վրա։ Հարմար է, եթե սև աշխատանքներն արված են։',
      en: 'Final coverings, doors and plumbing fixtures on surfaces that are already prepared. A good fit if the rough works are done.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'rough_works',
    topic: 'Что такое черновая отделка',
    label: { ru: 'Черновая отделка', hy: 'Սև աշխատանքներ', en: 'Rough works' },
    keywords: {
      ru: ['черновая', 'черновые работы'],
      hy: ['սև աշխատանքներ', 'նախնական աշխատանքներ'],
      hyLatin: ['chernovoy', 'nakhnakan ashkhatanqner', 'sev ashkhatanqner'],
      en: ['rough works', 'rough finish'],
    },
    answer: {
      ru: 'Стяжка, штукатурка, разводка электрики и воды. Без финишных покрытий.',
      hy: 'Հատակի հարթեցում, սվաղ, էլեկտրականության և ջրի գծանցում։ Առանց ավարտական ծածկույթների։',
      en: 'Screed, plaster, electrical and water routing. Without any final coverings.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'standard_package',
    topic: 'Что входит в стандартный пакет',
    label: { ru: 'Стандартный пакет', hy: 'Ստանդարտ փաթեթ', en: 'Standard package' },
    keywords: {
      ru: ['что входит', 'состав', 'включено', 'стандартный пакет'],
      hy: ['ինչ է մտնում', 'կազմ', 'ներառված է'],
      hyLatin: ['inch e mtnum', 'standart pakhet', 'kazm'],
      en: ['what is included', 'standard package', 'scope'],
    },
    answer: {
      ru: 'Черновые и чистовые работы под ключ, электрика и разводка воды по типовой схеме, выравнивание стен, полов и потолков, стандартные двери, покрытия и сантехника из базовой линейки, вывоз мусора и уборка после работ.',
      hy: 'Սև և ավարտական աշխատանքները բանալու հանձնմամբ, էլեկտրականությունը և ջրի գծանցումը տիպային սխեմայով, պատերի, հատակների և առաստաղների հարթեցում, ստանդարտ դռներ, ծածկույթներ և սանտեխնիկա բազային շարքից, աղբի դուրսբերում և մաքրում աշխատանքներից հետո։',
      en: 'Rough and finishing works on a turnkey basis, electrics and water routing to a standard layout, levelling of walls, floors and ceilings, standard doors, coverings and plumbing from the base range, waste removal and a clean-up after the work.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'design_project',
    topic: 'Дизайнерский проект',
    label: { ru: 'Дизайн-проект', hy: 'Դիզայն-նախագիծ', en: 'Design project' },
    keywords: {
      ru: ['дизайн', 'дизайнерский', 'по проекту', 'дизайн-проект'],
      hy: ['դիզայն', 'դիզայներական', 'ըստ նախագծի'],
      hyLatin: ['dizayn', 'dizayner', 'dizaynerakan'],
      en: ['design project', 'designer', 'custom design'],
    },
    answer: {
      ru: 'Индивидуальные решения, нетиповые материалы и работы по вашему дизайн-проекту. Формулой это не считается — цену определяет сметчик по вашим материалам и чертежам. Лучше всего, если есть проект от дизайнера. Если его нет — пришлите картинки, которые вам нравятся, хоть из Pinterest или Instagram: по ним уже понятно, к чему вы стремитесь. Оставьте заявку, и сметчик подготовит смету.',
      hy: 'Անհատական լուծումներ, ոչ տիպային նյութեր և աշխատանքներ՝ ըստ Ձեր դիզայն-նախագծի։ Բանաձևով այն չի հաշվվում՝ գինը որոշում է նախահաշվարկողը՝ ըստ Ձեր նյութերի և գծագրերի։ Ամենալավ տարբերակը, երբ դիզայներից նախագիծ կա։ Եթե չկա՝ ուղարկեք նկարներ, որոնք Ձեզ դուր են գալիս, թեկուզ Pinterest-ից կամ Instagram-ից. դրանցից արդեն պարզ է, թե ինչի եք ձգտում։ Թողեք հայտ, և նախահաշվարկողը կպատրաստի նախահաշիվը։',
      en: 'Individual solutions, non-standard materials and work to your own design project. A formula cannot price this — the figure is set by our estimator from your materials and drawings. It works best when you have a project from a designer. If you do not have one, send us pictures you like, even from Pinterest or Instagram: they already show what you are aiming for. Leave a request and the estimator will prepare a quote.',
    },
    actions: ['REQUEST'],
  },
  {
    id: 'no_design_project',
    topic: 'У меня нет дизайн-проекта — это проблема?',
    label: { ru: 'Нет дизайн-проекта', hy: 'Դիզայն-նախագիծ չկա', en: 'No design project' },
    keywords: {
      ru: ['нет дизайна', 'без проекта', 'сделаете дизайн', 'нужен дизайнер'],
      hy: ['դիզայն չկա', 'առանց նախագծի', 'դիզայներ պետք է'],
      hyLatin: ['dizayn chka', 'dizayner petq e', 'aranc nakhagci'],
      en: ['no design project', 'do you make design', 'need a designer'],
    },
    answer: {
      ru: 'Не проблема. Проект от дизайнера помогает, но без него тоже работаем — достаточно картинок с примерами, чтобы мы поняли ваш вкус. Если нужен дизайнер, мы можем его предоставить; его работа оплачивается отдельно и в расчётную сумму ремонта не входит.',
      hy: 'Խնդիր չէ։ Դիզայների նախագիծը օգնում է, բայց առանց դրա էլ աշխատում ենք՝ բավական են օրինակների նկարները, որպեսզի հասկանանք Ձեր ճաշակը։ Եթե դիզայներ է պետք, մենք կարող ենք տրամադրել. նրա աշխատանքը վճարվում է առանձին և վերանորոգման հաշվարկային գումարի մեջ չի մտնում։',
      en: 'Not a problem. A project from a designer helps, but we work without one too — a few reference pictures are enough for us to understand your taste. If you need a designer, we can provide one; their work is paid for separately and is not part of the calculated renovation figure.',
    },
    actions: ['REQUEST'],
  },
  {
    id: 'how_it_works',
    topic: 'Как у вас всё устроено',
    label: { ru: 'Как мы работаем', hy: 'Ինչպես ենք աշխատում', en: 'How it works' },
    keywords: {
      ru: ['как работаете', 'порядок', 'этапы', 'с чего начать'],
      hy: ['ինչպես եք աշխատում', 'փուլերը', 'որտեղից սկսել'],
      hyLatin: ['inchpes ek ashkhatum', 'pulery', 'vortexic sksel'],
      en: ['how it works', 'steps', 'where to start'],
    },
    answer: {
      ru: 'Четыре шага. Быстрый расчёт на сайте — заявка с планом БТИ — смета от сметчика за 1–2 рабочих дня — ваше решение. Начать можно прямо сейчас, расчёт займёт минуту.',
      hy: 'Չորս քայլ՝ արագ հաշվարկ կայքում, հայտ՝ տեխնիկական հատակագծով, նախահաշիվ նախահաշվարկողից 1–2 աշխատանքային օրում, ապա՝ Ձեր որոշումը։ Սկսել կարելի է հենց հիմա՝ հաշվարկը մեկ րոպե կտանի։',
      en: 'Four steps. A quick calculation on the site — a request with the technical floor plan — a detailed quote from our estimator within 1–2 working days — your decision. You can start right now; the calculation takes a minute.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'quote_eta',
    topic: 'Сколько ждать смету',
    label: { ru: 'Сроки сметы', hy: 'Նախահաշվի ժամկետը', en: 'Quote turnaround' },
    keywords: {
      ru: ['сколько ждать', 'когда ответите', 'срок сметы'],
      hy: ['որքան սպասել', 'երբ կպատասխանեք', 'նախահաշվի ժամկետ'],
      hyLatin: ['erb', 'qani or', 'vorqan spasel'],
      en: ['how long', 'when will you answer', 'quote time'],
    },
    answer: {
      ru: 'Сметчик отвечает за 1–2 рабочих дня. Быстрый расчёт вы получаете сразу.',
      hy: 'Նախահաշվարկողը պատասխանում է 1–2 աշխատանքային օրում։ Արագ հաշվարկը ստանում եք անմիջապես։',
      en: 'Our estimator replies within 1–2 working days. The quick calculation you get straight away.',
    },
  },
  {
    id: 'renovation_duration',
    topic: 'Сколько длится сам ремонт',
    label: { ru: 'Сроки ремонта', hy: 'Վերանորոգման ժամկետը', en: 'Renovation timeline' },
    keywords: {
      ru: ['сроки ремонта', 'сколько месяцев', 'как долго'],
      hy: ['վերանորոգման ժամկետ', 'քանի ամիս', 'որքան ժամանակ'],
      hyLatin: ['qani amis', 'zhamketer', 'vorqan zhamanak'],
      en: ['how long does renovation take', 'duration', 'months'],
    },
    answer: {
      ru: 'Для ориентира: квартира около 60 м² под ключ — примерно 3 месяца. Точный срок сметчик назовёт после замера: он зависит от объёма работ и от того, как быстро приходят материалы. Если материалы покупаете вы, срок во многом в ваших руках — задержка поставки сдвигает и работы.',
      hy: 'Կողմնորոշման համար՝ մոտ 60 մ² բնակարանը բանալու հանձնմամբ՝ մոտավորապես 3 ամիս։ Ճշգրիտ ժամկետը նախահաշվարկողը կասի չափագրումից հետո՝ դա կախված է աշխատանքների ծավալից և այն բանից, թե որքան արագ են գալիս նյութերը։ Եթե նյութերը գնում եք Դուք, ժամկետը մեծապես Ձեր ձեռքերում է՝ մատակարարման ուշացումը հետաձգում է նաև աշխատանքները։',
      en: 'As a guide: a flat of around 60 m² done turnkey takes roughly 3 months. The exact timeline comes from our estimator after the measurement: it depends on the scope of work and on how quickly materials arrive. If you buy the materials yourself, the timeline is largely in your hands — a delayed delivery delays the work as well.',
    },
  },
  {
    id: 'registration_needed',
    topic: 'Нужна ли регистрация',
    label: { ru: 'Регистрация', hy: 'Գրանցում', en: 'Registration' },
    keywords: {
      ru: ['регистрация', 'аккаунт', 'логин'],
      hy: ['գրանցում', 'հաշիվ', 'մուտք'],
      hyLatin: ['gracvel', 'hashiv', 'grancum'],
      en: ['registration', 'sign up', 'account'],
    },
    answer: {
      ru: 'Чтобы посчитать цену — нет. Чтобы отправить заявку и получить смету — да, нужна почта и телефон: иначе сметчику некуда прислать результат.',
      hy: 'Գինը հաշվելու համար՝ ոչ։ Հայտ ուղարկելու և նախահաշիվ ստանալու համար՝ այո, պետք են էլ. փոստ և հեռախոսահամար. այլապես նախահաշվարկողը արդյունքն ուղարկելու տեղ չի ունենա։',
      en: 'To calculate a price — no. To send a request and receive a quote — yes: we need your email and phone, otherwise the estimator has nowhere to send the result.',
    },
  },
  {
    id: 'site_visit',
    topic: 'Выезд замерщика',
    label: { ru: 'Выезд замерщика', hy: 'Չափագրողի այցը', en: 'Measurement visit' },
    keywords: {
      ru: ['замер', 'выезд', 'приедете посмотреть'],
      hy: ['չափագրում', 'չափագրող', 'գալիս եք'],
      hyLatin: ['chapagrum', 'chapogh', 'galis ek'],
      en: ['site visit', 'measurement', 'come and see'],
    },
    answer: {
      ru: 'Выезд замерщика бесплатный — он приезжает в течение 2–3 дней после того, как вы согласовали предварительный расчёт. Желательно, чтобы вы были на месте: на замере обсуждаются детали, и многие вопросы решаются сразу, на объекте.',
      hy: 'Չափագրողի այցը անվճար է՝ նա գալիս է 2–3 օրվա ընթացքում այն բանից հետո, երբ Դուք համաձայնեցնում եք նախնական հաշվարկը։ Ցանկալի է, որ Դուք տեղում լինեք. չափագրման ժամանակ քննարկվում են մանրամասները, և շատ հարցեր լուծվում են անմիջապես՝ օբյեկտում։',
      en: 'The measurement visit is free — our surveyor comes within 2–3 days after you approve the preliminary calculation. It is better if you are there: details are discussed during the measurement and many questions get settled on the spot.',
    },
    actions: ['REQUEST'],
  },
  {
    id: 'without_files',
    topic: 'Можно без файлов',
    label: { ru: 'Можно без файлов', hy: 'Առանց ֆայլերի', en: 'Without files' },
    keywords: {
      ru: ['без плана', 'нет бти', 'обязательно ли файлы'],
      hy: ['առանց հատակագծի', 'հատակագիծ չկա', 'ֆայլերը պարտադիր են'],
      hyLatin: ['chka plan', 'aranc plani', 'fayler partadir en'],
      en: ['without files', 'no floor plan', 'are files required'],
    },
    answer: {
      ru: 'Можно. Файлы не обязательны — заявку примем и без них. С планом БТИ смета получится точнее.',
      hy: 'Կարելի է։ Ֆայլերը պարտադիր չեն՝ հայտը կընդունենք նաև առանց դրանց։ Տեխնիկական հատակագծով նախահաշիվը կստացվի ավելի ճշգրիտ։',
      en: 'You can. Files are not required — we will accept your request without them. With a technical floor plan the quote comes out more precise.',
    },
    actions: ['REQUEST'],
  },
  {
    id: 'which_files',
    topic: 'Какие файлы прикладывать',
    label: { ru: 'Какие файлы нужны', hy: 'Ինչ ֆայլեր են պետք', en: 'Which files' },
    keywords: {
      ru: ['какие файлы', 'формат', 'что загрузить'],
      hy: ['ինչ ֆայլեր', 'ֆորմատ', 'ինչ վերբեռնել'],
      hyLatin: ['inch fayler', 'inch faylr', 'format'],
      en: ['what files', 'file format', 'what to upload'],
    },
    answer: {
      ru: 'План БТИ и, если есть, дизайн-проект. Форматы PDF, JPG, PNG и DWG, до 25 МБ, не больше десяти файлов на заявку.',
      hy: 'Տեխնիկական հատակագիծը և, եթե կա, դիզայն-նախագիծը։ Ֆորմատները՝ PDF, JPG, PNG և DWG, մինչև 25 ՄԲ, մեկ հայտի համար ոչ ավելի, քան տասը ֆայլ։',
      en: 'The technical floor plan and, if you have one, the design project. Formats: PDF, JPG, PNG and DWG, up to 25 MB, no more than ten files per request.',
    },
    actions: ['REQUEST'],
  },
  {
    id: 'quote_contents',
    topic: 'Что в смете',
    label: { ru: 'Что в смете', hy: 'Ինչ կա նախահաշվում', en: 'What is in the quote' },
    keywords: {
      ru: ['что в смете', 'по позициям', 'детализация'],
      hy: ['ինչ կա նախահաշվում', 'ըստ դիրքերի', 'մանրամասնություն'],
      hyLatin: ['smeta', 'nakhahashiv', 'inch ka nakhahashvum'],
      en: ['quote details', 'itemised quote', 'what is in the quote'],
    },
    answer: {
      ru: 'Детальная смета по позициям: работы, объёмы и стоимость. Приходит файлом в ваш кабинет, там же можно задать вопросы сметчику.',
      hy: 'Մանրամասն նախահաշիվ ըստ դիրքերի՝ աշխատանքներ, ծավալներ և արժեք։ Գալիս է ֆայլով Ձեր անձնական էջ, որտեղ նույն տեղում կարող եք հարցեր տալ նախահաշվարկողին։',
      en: 'A detailed, itemised quote: the works, the volumes and the cost. It arrives as a file in your account, where you can also ask the estimator questions.',
    },
  },
  {
    id: 'where_is_quote',
    topic: 'Как получу смету',
    label: { ru: 'Где смета', hy: 'Որտեղ է նախահաշիվը', en: 'Where is the quote' },
    keywords: {
      ru: ['где смета', 'как получу', 'пришлёте'],
      hy: ['որտեղ է նախահաշիվը', 'ինչպես կստանամ', 'կուղարկեք'],
      hyLatin: ['vortegh e smetan', 'inchpes kstanam', 'kugharkeq'],
      en: ['where is my quote', 'how will i get it', 'will you send it'],
    },
    answer: {
      ru: 'В личном кабинете на сайте, плюс письмо на вашу почту. Там же в заявке есть переписка со сметчиком — звонить не нужно.',
      hy: 'Կայքի անձնական էջում, գումարած՝ նամակ Ձեր էլ. փոստին։ Նույն հայտի մեջ կա նաև նամակագրություն նախահաշվարկողի հետ՝ զանգահարել պետք չէ։',
      en: 'In your account on the site, plus an email to your inbox. The request itself also holds your correspondence with the estimator — there is no need to call.',
    },
  },
  {
    id: 'discuss_quote',
    topic: 'Можно обсудить смету',
    label: { ru: 'Обсудить смету', hy: 'Քննարկել նախահաշիվը', en: 'Discuss the quote' },
    keywords: {
      ru: ['обсудить', 'вопросы по смете', 'изменить'],
      hy: ['քննարկել', 'հարցեր նախահաշվի վերաբերյալ', 'փոփոխել'],
      hyLatin: ['qnnarkel', 'harcer nakhahashvi masin', 'popokhel'],
      en: ['discuss the quote', 'questions about the quote', 'change the quote'],
    },
    answer: {
      ru: 'Да, внутри заявки есть обсуждение: пишете вопрос, сметчик отвечает там же, файлы тоже можно приложить.',
      hy: 'Այո, հայտի ներսում կա քննարկում՝ գրում եք հարցը, նախահաշվարկողը պատասխանում է նույն տեղում, ֆայլեր նույնպես կարելի է կցել։',
      en: 'Yes — each request has a discussion thread: you write your question, the estimator answers there, and files can be attached too.',
    },
  },
  {
    id: 'reject_quote',
    topic: 'Отказаться от сметы',
    label: { ru: 'Отказаться от сметы', hy: 'Մերժել նախահաշիվը', en: 'Decline the quote' },
    keywords: {
      ru: ['отказ', 'отклонить', 'не подошло'],
      hy: ['մերժել', 'հրաժարվել', 'չի բավարարել'],
      hyLatin: ['merzhel', 'hrazharvel', 'chi bavararel'],
      en: ['reject', 'decline', 'not suitable'],
    },
    answer: {
      ru: 'Можно отклонить, указав причину. Это помогает нам понять, что не подошло — цена, сроки или что-то ещё.',
      hy: 'Կարող եք մերժել՝ նշելով պատճառը։ Դա օգնում է մեզ հասկանալ, թե ինչը չի բավարարել՝ գինը, ժամկետները, թե այլ բան։',
      en: 'You can decline it and give a reason. That helps us understand what did not work for you — the price, the timeline or something else.',
    },
  },
  {
    id: 'payment_terms',
    topic: 'Как оплачивается ремонт',
    label: { ru: 'Оплата и предоплата', hy: 'Վճարում և կանխավճար', en: 'Payment terms' },
    keywords: {
      ru: ['оплата', 'предоплата', 'этапы оплаты', 'аванс', 'как платить'],
      hy: ['վճարում', 'կանխավճար', 'ինչպես վճարել'],
      hyLatin: ['vcharum', 'kankhavchar', 'inchpes vcharel'],
      en: ['payment', 'prepayment', 'how to pay', 'deposit'],
    },
    answer: {
      ru: 'Предоплата — 50 %, остальное по договорённости: здесь мы гибкие и подстраиваемся под вас. Предоплата нужна не нам «на всякий случай» — из неё бригада получает оплату каждый месяц, пока идут работы. Так люди работают спокойно и объект не останавливается.',
      hy: 'Կանխավճարը՝ 50 %, մնացածը՝ պայմանավորվածությամբ. այստեղ մենք ճկուն ենք և հարմարվում ենք Ձեզ։ Կանխավճարը մեզ «ամեն դեպքի համար» չէ պետք՝ դրանից է բրիգադը ամսական վարձատրություն ստանում, քանի դեռ աշխատանքները շարունակվում են։ Այդպես մարդիկ հանգիստ են աշխատում, և օբյեկտը չի կանգնում։',
      en: 'The prepayment is 50 %, the rest by agreement: we are flexible here and fit around you. The prepayment is not a safety net for us — the crew is paid out of it every month while the work goes on. That way people work calmly and the site never comes to a halt.',
    },
  },
  {
    id: 'materials',
    topic: 'Материалы чьи',
    label: { ru: 'Материалы', hy: 'Նյութերը', en: 'Materials' },
    keywords: {
      ru: ['материалы', 'кто покупает', 'свои материалы', 'закупка'],
      hy: ['նյութեր', 'ով է գնում', 'նյութերի գնում'],
      hyLatin: ['nyuter', 'ov e gnum', 'nyutery ov e gnum'],
      en: ['materials', 'who buys materials', 'purchasing'],
    },
    answer: {
      ru: 'Материалы покупает заказчик — так вы сами выбираете, что будет у вас дома, и видите все цены. Если заниматься закупкой неудобно, мы купим за вас именно то, что вы выбрали, отдадим все чеки и ничего сверху не возьмём. Отдельно обсуждаем только особые случаи — например, если материал нужно везти из другого региона или из-за рубежа.',
      hy: 'Նյութերը գնում է պատվիրատուն՝ այդպես Դուք ինքներդ եք ընտրում, թե ինչ կլինի Ձեր տանը, և տեսնում եք բոլոր գները։ Եթե գնումներով զբաղվելը հարմար չէ, մենք Ձեր փոխարեն կգնենք հենց այն, ինչ Դուք ընտրել եք, կտանք բոլոր կտրոնները և վրադիր ոչինչ չենք վերցնի։ Առանձին քննարկում ենք միայն հատուկ դեպքերը՝ օրինակ, եթե նյութը պետք է բերել այլ մարզից կամ արտերկրից։',
      en: 'The client buys the materials — that way you choose yourself what goes into your home and you see every price. If doing the shopping is inconvenient, we will buy exactly what you chose on your behalf, hand over all the receipts and add nothing on top. We discuss separately only special cases — for example when a material has to be brought from another region or from abroad.',
    },
  },
  {
    id: 'warranty',
    topic: 'Гарантия',
    label: { ru: 'Гарантия', hy: 'Երաշխիք', en: 'Warranty' },
    keywords: {
      ru: ['гарантия', 'если что-то сломается', 'переделаете ли'],
      hy: ['երաշխիք', 'եթե ինչ-որ բան փչանի', 'կվերանորոգեք'],
      hyLatin: ['erashkhiq', 'kverjnordeq', 'ete inch vor ban pchani'],
      en: ['warranty', 'guarantee', 'will you fix it'],
    },
    answer: {
      ru: 'Мы не меряем свою работу сроком гарантии. Для нас важнее другое: чтобы у вас всё было сделано как надо и чтобы вы спокойно назвали нас знакомым. Репутация в Армении зарабатывается годами и теряется за один объект — поэтому, если что-то окажется не так, мы это решим. Это не формулировка из договора, это то, как мы работаем.',
      hy: 'Մենք մեր աշխատանքը երաշխիքի ժամկետով չենք չափում։ Մեզ համար ավելի կարևոր է այլ բան՝ որ Ձեզ մոտ ամեն ինչ արված լինի ինչպես հարկն է, և որ Դուք հանգիստ մեր անունը տաք Ձեր ծանոթներին։ Հայաստանում հեղինակությունը վաստակվում է տարիներով և կորչում է մեկ օբյեկտով՝ դրա համար, եթե ինչ-որ բան այնպես չստացվի, մենք դա կլուծենք։ Սա պայմանագրի ձևակերպում չէ, սա այն է, թե ինչպես ենք մենք աշխատում։',
      en: 'We do not measure our work by a warranty period. Something else matters more to us: that everything in your home is done properly, and that you can recommend us to people you know without a second thought. In Armenia a reputation is earned over years and lost on a single project — so if something turns out wrong, we will put it right. This is not a clause from a contract, it is how we work.',
    },
  },
  {
    id: 'contract',
    topic: 'Договор',
    label: { ru: 'Договор', hy: 'Պայմանագիր', en: 'Contract' },
    keywords: {
      ru: ['договор', 'контракт', 'официально'],
      hy: ['պայմանագիր', 'պաշտոնապես'],
      hyLatin: ['paymanagir', 'pashtonapes'],
      en: ['contract', 'official agreement'],
    },
    answer: {
      ru: 'Да, если вам нужен письменный договор — оформим. В нём фиксируются объём работ, сумма и порядок оплаты.',
      hy: 'Այո, եթե Ձեզ գրավոր պայմանագիր է պետք՝ կկազմենք։ Դրանում ամրագրվում են աշխատանքների ծավալը, գումարը և վճարման կարգը։',
      en: 'Yes — if you want a written contract, we will draw one up. It sets out the scope of work, the amount and the payment schedule.',
    },
  },
  {
    id: 'installments',
    topic: 'Рассрочка',
    label: { ru: 'Рассрочка', hy: 'Ապառիկ', en: 'Installments' },
    keywords: {
      ru: ['рассрочка', 'кредит', 'частями', 'банк'],
      hy: ['ապառիկ', 'վարկ', 'մաս-մաս', 'բանկ'],
      hyLatin: ['masnakanacum', 'varkayin', 'aparik', 'mas mas'],
      en: ['installments', 'credit', 'pay in parts', 'bank'],
    },
    answer: {
      ru: 'Банковской рассрочки у нас нет. Но платить всю сумму сразу и не нужно: после предоплаты остаток вносится частями по ходу работ, по договорённости — вплоть до окончания ремонта. Условия обсуждаем с вами лично.',
      hy: 'Բանկային ապառիկ մեզ մոտ չկա։ Բայց ամբողջ գումարը միանգամից վճարել էլ պետք չէ՝ կանխավճարից հետո մնացածը մուծվում է մաս-մաս, աշխատանքների ընթացքում, պայմանավորվածությամբ՝ ընդհուպ մինչև վերանորոգման ավարտը։ Պայմանները քննարկում ենք Ձեզ հետ անձամբ։',
      en: 'We do not offer bank installments. But you do not have to pay the whole sum at once: after the prepayment the balance is paid in parts as the work goes on, by agreement, right up to the end of the renovation. We discuss the terms with you personally.',
    },
    actions: ['CALL'],
  },
  {
    id: 'final_price',
    topic: 'Цена окончательная',
    label: { ru: 'Окончательная цена', hy: 'Վերջնական գինը', en: 'Final price' },
    keywords: {
      ru: ['вырастет ли цена', 'доплаты', 'скрытые платежи', 'изменится ли смета'],
      hy: ['գինը կբարձրանա', 'լրացուցիչ վճարումներ', 'թաքնված վճարներ'],
      hyLatin: ['lracucich vcharumner', 'gin kpoxvi', 'taqnvats vcharner'],
      en: ['hidden costs', 'final price', 'will the price go up'],
    },
    answer: {
      ru: 'Скрытых доплат у нас нет: сумма из сметы остаётся прежней, пока остаётся прежним объём работ. Меняется она в одном случае — если вы сами по ходу ремонта захотите то, чего не было в плане. Такие пожелания мы считаем и согласовываем с вами до начала работ, а не ставим перед фактом в конце.',
      hy: 'Թաքնված լրավճարներ մեզ մոտ չկան՝ նախահաշվի գումարը մնում է նույնը, քանի դեռ նույնն է աշխատանքների ծավալը։ Այն փոխվում է մեկ դեպքում՝ եթե Դուք ինքներդ վերանորոգման ընթացքում ցանկանաք այն, ինչ նախատեսված չէր։ Այդպիսի ցանկությունները մենք հաշվում և համաձայնեցնում ենք Ձեզ հետ մինչև աշխատանքների մեկնարկը, ոչ թե վերջում փաստի առաջ դնում։',
      en: 'There are no hidden extras with us: the figure in the quote stays the same for as long as the scope of work stays the same. It changes in one case only — if you yourself want something during the renovation that was not in the plan. We price such wishes and agree them with you before the work starts, instead of presenting you with a fact at the end.',
    },
  },
  {
    id: 'coverage_area',
    topic: 'Где вы работаете',
    label: { ru: 'Где вы работаете', hy: 'Որտեղ եք աշխատում', en: 'Where we work' },
    keywords: {
      ru: ['где работаете', 'ереван', 'регионы', 'город', 'область'],
      hy: ['որտեղ եք աշխատում', 'երևան', 'մարզեր'],
      hyLatin: ['vortegh', 'yerevan', 'marzer'],
      en: ['where do you work', 'yerevan', 'regions'],
    },
    answer: {
      ru: 'По всей Армении. Назовите город или область — скажу, как это отразится на сроках выезда.',
      hy: 'Ամբողջ Հայաստանում։ Նշեք քաղաքը կամ մարզը՝ կասեմ, թե դա ինչպես կազդի այցի ժամկետների վրա։',
      en: 'All over Armenia. Tell me the city or region and I will say how it affects the visit timeline.',
    },
  },
  {
    id: 'our_team',
    topic: 'Кто делает ремонт',
    label: { ru: 'Кто делает ремонт', hy: 'Ով է կատարում աշխատանքը', en: 'Who does the work' },
    keywords: {
      ru: ['бригада', 'рабочие', 'субподряд', 'свои ли', 'мастера'],
      hy: ['բրիգադ', 'աշխատողներ', 'վարպետներ'],
      hyLatin: ['brigad', 'ashkhatogner', 'varpetner'],
      en: ['who does the work', 'crew', 'subcontractors'],
    },
    answer: {
      ru: 'Свои специалисты по всем работам — от сантехников и электриков до маляров, с бригадиром на объекте. И у каждого объекта есть свой менеджер: с ним вы на связи по любому вопросу, бегать за отдельными мастерами не нужно.',
      hy: 'Բոլոր աշխատանքներով՝ մեր սեփական մասնագետները՝ սանտեխնիկներից և էլեկտրիկներից մինչև ներկարարները, օբյեկտում՝ բրիգադավարի հետ։ Եվ ամեն օբյեկտ ունի իր մենեջերը՝ նրա հետ կապի մեջ եք ցանկացած հարցով, առանձին վարպետների հետևից վազել պետք չէ։',
      en: 'Our own specialists for every kind of work — from plumbers and electricians to painters, with a foreman on site. And every project has its own manager: you stay in touch with them on any question, with no need to chase individual tradesmen.',
    },
  },
  {
    id: 'portfolio',
    topic: 'Можно посмотреть ваши работы',
    label: { ru: 'Наши работы', hy: 'Մեր աշխատանքները', en: 'Our work' },
    keywords: {
      ru: ['портфолио', 'примеры', 'фото работ', 'инстаграм'],
      hy: ['պորտֆոլիո', 'աշխատանքների լուսանկարներ', 'օրինակներ'],
      hyLatin: ['ashkhatanqneri lusankarner', 'instagram eji', 'tesnel ashkhatanqnery'],
      en: ['portfolio', 'examples', 'photos of your work', 'instagram'],
    },
    answer: {
      ru: 'Конечно — наши работы собраны в Instagram: https://www.instagram.com/renovate_am — там видно и процесс, и результат по разным объектам.',
      hy: 'Իհարկե։ Մեր աշխատանքները հավաքված են Instagram-ում՝ https://www.instagram.com/renovate_am — այնտեղ երևում է և՛ ընթացքը, և՛ արդյունքը տարբեր օբյեկտներում։',
      en: 'Of course — our work is collected on Instagram: https://www.instagram.com/renovate_am — you can see both the process and the result across different projects.',
    },
    actions: ['PORTFOLIO'],
  },
  {
    id: 'contact_us',
    topic: 'Как с вами связаться',
    label: { ru: 'Связаться с нами', hy: 'Կապվել մեզ հետ', en: 'Contact us' },
    keywords: {
      ru: ['телефон', 'контакты', 'позвонить', 'адрес'],
      hy: ['հեռախոս', 'կոնտակտներ', 'զանգահարել'],
      hyLatin: ['herakhos', 'kapvel', 'zangahrel'],
      en: ['contact', 'phone', 'call you', 'whatsapp'],
    },
    answer: {
      ru: 'Звоните или пишите в WhatsApp: +374 99 099 457. Можно и наоборот — оставьте здесь номер, и мы позвоним сами.',
      hy: 'Զանգահարեք կամ գրեք WhatsApp-ով՝ +374 99 099 457։ Կարելի է նաև հակառակը՝ թողեք այստեղ Ձեր համարը, և մենք ինքներս կզանգահարենք։',
      en: 'Call us or write on WhatsApp: +374 99 099 457. Or the other way round — leave your number here and we will call you ourselves.',
    },
    actions: ['CALL'],
  },
  {
    id: 'greeting_reply',
    topic: 'Приветствие',
    label: { ru: 'Приветствие', hy: 'Ողջույն', en: 'Greeting' },
    keywords: {
      ru: ['привет', 'здравствуйте', 'добрый день'],
      hy: ['բարև', 'բարև ձեզ', 'ողջույն'],
      hyLatin: ['barev', 'barev dzez', 'voghjuyn'],
      en: ['hi', 'hello', 'good day'],
    },
    answer: {
      ru: 'Здравствуйте! Помогу разобраться со стоимостью ремонта. Могу посчитать ориентировочную цену за минуту или ответить на вопросы о пакетах и порядке работы.',
      hy: 'Բարև Ձեզ։ Կօգնեմ պարզել վերանորոգման արժեքը։ Կարող եմ մեկ րոպեում հաշվել մոտավոր գինը կամ պատասխանել փաթեթների և աշխատանքի կարգի մասին հարցերին։',
      en: 'Hello! I can help you work out what your renovation will cost. I can calculate an approximate price in a minute, or answer questions about our packages and how we work.',
    },
    actions: ['ESTIMATE'],
  },
  {
    id: 'thanks',
    topic: 'Благодарность',
    label: { ru: 'Благодарность', hy: 'Շնորհակալություն', en: 'Thanks' },
    keywords: {
      ru: ['спасибо', 'благодарю'],
      hy: ['շնորհակալություն', 'մերսի'],
      hyLatin: ['shnorhakalutyun', 'merci'],
      en: ['thanks', 'thank you'],
    },
    answer: {
      ru: 'Пожалуйста. Если появятся вопросы — пишите, я здесь.',
      hy: 'Խնդրեմ։ Եթե հարցեր առաջանան՝ գրեք, ես այստեղ եմ։',
      en: 'You are welcome. If any questions come up, just write — I am here.',
    },
  },
  {
    id: 'ask_for_human',
    topic: 'Позвать человека',
    label: { ru: 'Позвать человека', hy: 'Կանչել մասնագետի', en: 'Talk to a person' },
    keywords: {
      ru: ['оператор', 'человек', 'менеджер', 'живой'],
      hy: ['օպերատոր', 'մարդ', 'մենեջեր'],
      hyLatin: ['mard', 'operator', 'menejer'],
      en: ['human', 'manager', 'real person'],
    },
    answer: {
      ru: 'Передаю ваш вопрос сметчику — он ответит в рабочее время. Оставьте, пожалуйста, имя и телефон, чтобы он мог связаться.',
      hy: 'Փոխանցում եմ Ձեր հարցը նախահաշվարկողին՝ նա կպատասխանի աշխատանքային ժամերին։ Խնդրում եմ թողնել Ձեր անունը և հեռախոսահամարը, որպեսզի նա կարողանա կապվել։',
      en: 'I am passing your question to our estimator — they will answer during working hours. Please leave your name and phone number so they can get in touch.',
    },
    actions: ['HUMAN'],
  },
];
