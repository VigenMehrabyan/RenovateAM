/**
 * Схемы форм. Сообщения — это **ключи i18n**, а не готовый текст: строки в
 * компонентах не хардкодятся, перевод подставляется на отрисовке ошибки.
 */
import { MAX_AREA_SQM, MIN_AREA_SQM } from '@renovateam/pricing-core';
import { z } from 'zod';

/** Армянский номер: +374 и восемь цифр (MVP US-2). */
export const ARMENIAN_PHONE_PATTERN = /^\+374\d{8}$/;

/** Пароль: ≥8 символов, минимум одна буква и одна цифра. */
export const PASSWORD_LETTER = /[A-Za-zА-Яа-яԱ-Ֆա-ֆ]/;
export const PASSWORD_DIGIT = /\d/;

export const calculatorSchema = z.object({
  areaSqm: z
    .number({
      required_error: 'calculator.validation.areaRequired',
      invalid_type_error: 'calculator.validation.areaNumber',
    })
    .refine((value) => Number.isFinite(value), 'calculator.validation.areaNumber')
    .refine(
      (value) => value >= MIN_AREA_SQM && value <= MAX_AREA_SQM,
      'calculator.validation.areaRange',
    ),
  objectType: z.enum(['APARTMENT', 'HOUSE'], {
    required_error: 'calculator.validation.optionRequired',
  }),
  workScope: z.enum(['TURNKEY', 'FINISHING', 'ROUGH'], {
    required_error: 'calculator.validation.optionRequired',
  }),
  finishPackage: z.enum(['STANDARD', 'DESIGNER'], {
    required_error: 'calculator.validation.optionRequired',
  }),
  condition: z.enum(['NEW_BUILDING', 'SECONDARY_WITH_DEMOLITION'], {
    required_error: 'calculator.validation.optionRequired',
  }),
  ceilingHeight: z.enum(['UP_TO_3M', 'FROM_3M'], {
    required_error: 'calculator.validation.optionRequired',
  }),
});

export type CalculatorValues = z.infer<typeof calculatorSchema>;

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'auth.validation.fullNameRequired')
    .min(2, 'auth.validation.fullNameShort')
    .max(200, 'auth.validation.fullNameShort'),
  email: z
    .string()
    .trim()
    .min(1, 'auth.validation.emailRequired')
    .email('auth.validation.emailInvalid'),
  phone: z
    .string()
    .trim()
    .min(1, 'auth.validation.phoneRequired')
    .regex(ARMENIAN_PHONE_PATTERN, 'auth.validation.phoneInvalid'),
  address: z
    .string()
    .trim()
    .min(1, 'auth.validation.addressRequired')
    .min(5, 'auth.validation.addressShort')
    .max(500, 'auth.validation.addressShort'),
  password: z
    .string()
    .min(1, 'auth.validation.passwordRequired')
    .min(8, 'auth.validation.passwordShort')
    .regex(PASSWORD_LETTER, 'auth.validation.passwordWeak')
    .regex(PASSWORD_DIGIT, 'auth.validation.passwordWeak'),
});

export type RegisterValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'auth.validation.emailRequired')
    .email('auth.validation.emailInvalid'),
  password: z.string().min(1, 'auth.validation.passwordRequired'),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const decisionSchema = z
  .object({
    reason: z
      .enum(['TOO_EXPENSIVE', 'TOO_LONG', 'CHOSE_ANOTHER', 'POSTPONED', 'OTHER'], {
        required_error: 'cabinet.decision.reasonRequired',
        invalid_type_error: 'cabinet.decision.reasonRequired',
      })
      .optional(),
    comment: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'cabinet.decision.reasonRequired',
      });
      return;
    }
    if (values.reason === 'OTHER' && !values.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'cabinet.decision.commentRequired',
      });
    }
  });

export type DecisionValues = z.infer<typeof decisionSchema>;

export const quoteUploadSchema = z.object({
  totalAmount: z
    .number({ invalid_type_error: 'admin.request.quoteTotalRequired' })
    .refine((value) => Number.isFinite(value) && value > 0, 'admin.request.quoteTotalRequired'),
});

export const statusChangeSchema = z
  .object({
    to: z.enum(['NEW', 'IN_PROGRESS', 'NEEDS_INFO', 'QUOTE_READY', 'ACCEPTED', 'REJECTED']),
    comment: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.to === 'NEEDS_INFO' && !values.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'admin.request.statusCommentRequired',
      });
    }
  });

const positiveRate = z
  .number({ invalid_type_error: 'admin.rates.positiveRequired' })
  .refine((value) => Number.isFinite(value) && value > 0, 'admin.rates.positiveRequired');

export const ratesSchema = z.object({
  base_rate_amd: positiveRate,
  scope_turnkey: positiveRate,
  scope_finishing: positiveRate,
  scope_rough: positiveRate,
  object_apartment: positiveRate,
  object_house: positiveRate,
  condition_new: positiveRate,
  condition_secondary: positiveRate,
  ceiling_up_to_3m: positiveRate,
  ceiling_from_3m: positiveRate,
  range_min: positiveRate,
  range_max: positiveRate,
  note: z.string().trim().max(500).optional(),
});

export type RatesValues = z.infer<typeof ratesSchema>;
