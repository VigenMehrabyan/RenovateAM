/**
 * Данные мок-слоя: несколько тем для разработки и тестов.
 *
 * Это НЕ база знаний — настоящая живёт в `apps/api/.../knowledge/entries.ts`
 * и её ведёт другая команда. Здесь ровно столько тем, сколько нужно, чтобы
 * виджет можно было прощупать руками: ответ по теме, спорный случай,
 * `fallback`, кнопки действий и подсказки.
 */
import type { ChatActionKind } from '../types';

export type MockLocale = 'ru' | 'hy' | 'en';

export interface MockEntry {
  id: string;
  keywords: string[];
  text: Record<MockLocale, string>;
  actions?: ChatActionKind[];
  suggestions?: Record<MockLocale, string[]>;
}

export const MOCK_SERVICE: Record<string, Record<MockLocale, string>> = {
  greeting: {
    ru: 'Здравствуйте! Я помогу разобраться со стоимостью и сроками ремонта. Спросите что угодно обычными словами.',
    hy: 'Բարև Ձեզ: Կօգնեմ հասկանալ վերանորոգման գինն ու ժամկետները: Հարցրեք սովորական բառերով:',
    en: 'Hello! I can help you with renovation prices and timelines. Ask anything in plain words.',
  },
  contacts_request: {
    ru: 'Чтобы продолжить разговор, оставьте, пожалуйста, имя, телефон и почту — так менеджер сможет ответить точнее.',
    hy: 'Զրույցը շարունակելու համար թողեք անունը, հեռախոսն ու էլ. փոստը — մենեջերը կպատասխանի ավելի ճշգրիտ:',
    en: 'To continue, please leave your name, phone and email so a manager can answer precisely.',
  },
  contacts_thanks: {
    ru: 'Спасибо! Записал. Менеджер свяжется с вами в рабочее время.',
    hy: 'Շնորհակալություն: Գրանցեցի: Մենեջերը կկապվի Ձեզ հետ աշխատանքային ժամերին:',
    en: 'Thank you! Saved. A manager will contact you during working hours.',
  },
  fallback: {
    ru: 'Не нашёл точного ответа на этот вопрос. Позвать человека — он ответит подробно.',
    hy: 'Հստակ պատասխան չգտա: Կարող եմ կանչել մարդ — նա կպատասխանի մանրամասն:',
    en: 'I could not find a precise answer. I can call a human who will answer in detail.',
  },
  handoff_done: {
    ru: 'Передал разговор менеджеру. Он посмотрит переписку и перезвонит.',
    hy: 'Զրույցը փոխանցեցի մենեջերին: Նա կկարդա նամակագրությունը և կզանգահարի:',
    en: 'I passed the conversation to a manager. They will read it and call you back.',
  },
};

export const MOCK_ENTRIES: MockEntry[] = [
  {
    id: 'price_turnkey',
    keywords: ['цена', 'стоимость', 'сколько', 'price', 'cost', 'arji', 'gin'],
    text: {
      ru: 'Ремонт под ключ считается от площади, состояния объекта и пакета отделки. Точную вилку даёт калькулятор — он считает по действующим ставкам.',
      hy: 'Վերանորոգման գինը կախված է մակերեսից, օբյեկտի վիճակից և հարդարման փաթեթից: Ճշգրիտ միջակայքը տալիս է հաշվիչը:',
      en: 'A turnkey price depends on area, the state of the property and the finish package. The calculator gives the exact range.',
    },
    actions: ['ESTIMATE', 'REQUEST'],
    suggestions: {
      ru: ['Сколько длится ремонт?', 'Что входит в пакет?'],
      hy: ['Որքա՞ն է տևում վերանորոգումը:', 'Ի՞նչ է ներառված փաթեթում:'],
      en: ['How long does it take?', 'What is included?'],
    },
  },
  {
    id: 'duration',
    keywords: ['срок', 'сколько длится', 'время', 'duration', 'how long', 'jamket'],
    text: {
      ru: 'Квартира 60 м² под ключ — около трёх месяцев. Срок фиксируется в договоре вместе с графиком этапов.',
      hy: '60 մ² բնակարանը «բանալու տակ» — մոտ երեք ամիս: Ժամկետը ամրագրվում է պայմանագրում:',
      en: 'A 60 m² turnkey flat takes about three months. The timeline is fixed in the contract.',
    },
    actions: ['REQUEST'],
  },
  {
    id: 'portfolio',
    keywords: ['работы', 'портфолио', 'примеры', 'фото', 'portfolio', 'examples', 'instagram'],
    text: {
      ru: 'Наши работы собраны в Instagram — там видно и процесс, и результат по разным объектам.',
      hy: 'Մեր աշխատանքները հավաքված են Instagram-ում — երևում է և՛ ընթացքը, և՛ արդյունքը:',
      en: 'Our work is collected on Instagram — both the process and the result.',
    },
    actions: ['PORTFOLIO'],
  },
  {
    id: 'contact',
    keywords: ['телефон', 'позвонить', 'связаться', 'phone', 'call', 'kapvel'],
    text: {
      ru: 'Звоните или пишите в WhatsApp: +374 99 099 457. Можно наоборот — оставьте номер, и мы позвоним сами.',
      hy: 'Զանգահարեք կամ գրեք WhatsApp՝ +374 99 099 457: Կամ թողեք համարը, և մենք կզանգենք:',
      en: 'Call or write on WhatsApp: +374 99 099 457. Or leave your number and we will call you.',
    },
    actions: ['CALL', 'HUMAN'],
  },
];
