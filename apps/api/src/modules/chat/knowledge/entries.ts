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
      hy: 'Բարև Ձեզ: Ես RenovateAM-ի օգնականն եմ։ Կպատասխանեմ գների, ժամկետների և աշխատանքների կազմի մասին՝ հարցրեք Ձեր բառերով։',
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
 * Темы базы знаний.
 *
 * ВРЕМЕННЫЙ СОСТАВ: здесь две темы из сорока, чтобы модуль собирался и
 * тесты движка имели данные. Полный набор готовит команда базы знаний —
 * она заменяет этот массив целиком, ничего больше в файле не трогая.
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
];
