import { describe, expect, it } from 'vitest';
import { calculatorSchema, decisionSchema, loginSchema, registerSchema } from '@/lib/validation';

const validRegistration = {
  fullName: 'Աram Petrosyan',
  email: 'aram@example.am',
  phone: '+37410123456',
  address: 'Երևան, Բաղրամյան 12',
  password: 'renovate1',
};

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe('форма регистрации', () => {
  it('принимает корректные данные', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it('требует все обязательные поля', () => {
    for (const field of ['fullName', 'email', 'phone', 'address', 'password'] as const) {
      const result = registerSchema.safeParse({ ...validRegistration, [field]: '' });
      expect(result.success, field).toBe(false);
    }
  });

  it('проверяет армянский формат телефона', () => {
    const accepted = ['+37410123456', '+37493123456'];
    const rejected = ['+7 999 123 45 67', '10123456', '+3741012345', '+374101234567', '374101234'];

    for (const phone of accepted) {
      expect(registerSchema.safeParse({ ...validRegistration, phone }).success, phone).toBe(true);
    }
    for (const phone of rejected) {
      const result = registerSchema.safeParse({ ...validRegistration, phone });
      expect(result.success, phone).toBe(false);
      expect(firstMessage(result)).toBe('auth.validation.phoneInvalid');
    }
  });

  it('проверяет правила пароля: 8+, буква и цифра', () => {
    const short = registerSchema.safeParse({ ...validRegistration, password: 'ren1' });
    expect(firstMessage(short)).toBe('auth.validation.passwordShort');

    const noDigit = registerSchema.safeParse({ ...validRegistration, password: 'renovateam' });
    expect(firstMessage(noDigit)).toBe('auth.validation.passwordWeak');

    const noLetter = registerSchema.safeParse({ ...validRegistration, password: '12345678' });
    expect(firstMessage(noLetter)).toBe('auth.validation.passwordWeak');

    expect(registerSchema.safeParse({ ...validRegistration, password: 'Ремонт2026' }).success).toBe(
      true,
    );
  });

  it('проверяет e-mail', () => {
    const result = registerSchema.safeParse({ ...validRegistration, email: 'not-an-email' });
    expect(firstMessage(result)).toBe('auth.validation.emailInvalid');
  });
});

describe('форма входа', () => {
  it('требует e-mail и пароль', () => {
    expect(loginSchema.safeParse({ email: '', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.am', password: 'x' }).success).toBe(true);
  });
});

describe('форма расчёта', () => {
  it('отклоняет площадь вне диапазона 10–1000', () => {
    const base = {
      objectType: 'APARTMENT',
      workScope: 'TURNKEY',
      finishPackage: 'STANDARD',
      condition: 'NEW_BUILDING',
      ceilingHeight: 'UP_TO_3M',
    };
    for (const areaSqm of [9.9, 0, -5, 1000.1, 5000]) {
      const result = calculatorSchema.safeParse({ ...base, areaSqm });
      expect(result.success, String(areaSqm)).toBe(false);
      expect(firstMessage(result)).toBe('calculator.validation.areaRange');
    }
    expect(calculatorSchema.safeParse({ ...base, areaSqm: 10 }).success).toBe(true);
    expect(calculatorSchema.safeParse({ ...base, areaSqm: 1000 }).success).toBe(true);
  });
});

describe('решение по смете', () => {
  it('требует причину отказа', () => {
    const result = decisionSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe('cabinet.decision.reasonRequired');
  });

  it('для причины «другое» требует комментарий', () => {
    const result = decisionSchema.safeParse({ reason: 'OTHER' });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe('cabinet.decision.commentRequired');
    expect(decisionSchema.safeParse({ reason: 'OTHER', comment: 'нашёл дешевле' }).success).toBe(
      true,
    );
  });

  it('для остальных причин комментарий не обязателен', () => {
    expect(decisionSchema.safeParse({ reason: 'TOO_EXPENSIVE' }).success).toBe(true);
  });
});
