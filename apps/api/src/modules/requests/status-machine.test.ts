import { describe, expect, it } from 'vitest';
import { RequestStatus, UserRole } from '../../generated/prisma/enums';
import {
  ACTIVE_STATUSES,
  CLIENT_ONLY_TRANSITIONS,
  TERMINAL_STATUSES,
  TRANSITIONS,
  canTransition,
  checkTransition,
  isStaffRole,
} from './status-machine';

const ALL_STATUSES = Object.values(RequestStatus);

describe('матрица переходов', () => {
  it('соответствует таблице из ARCHITECTURE.md §8', () => {
    expect(TRANSITIONS).toEqual({
      NEW: ['IN_PROGRESS', 'NEEDS_INFO'],
      IN_PROGRESS: ['NEEDS_INFO', 'QUOTE_READY'],
      NEEDS_INFO: ['IN_PROGRESS', 'QUOTE_READY'],
      QUOTE_READY: ['ACCEPTED', 'REJECTED', 'NEEDS_INFO'],
      ACCEPTED: [],
      REJECTED: [],
    });
  });

  it('любая пара вне матрицы запрещена', () => {
    let allowed = 0;
    let forbidden = 0;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (TRANSITIONS[from].includes(to)) {
          expect(canTransition(from, to)).toBe(true);
          allowed += 1;
        } else {
          expect(canTransition(from, to)).toBe(false);
          forbidden += 1;
        }
      }
    }
    expect(allowed).toBe(9);
    expect(forbidden).toBe(ALL_STATUSES.length * ALL_STATUSES.length - 9);
  });

  it('заявка не может вернуться в NEW ни из какого статуса', () => {
    for (const from of ALL_STATUSES) {
      expect(canTransition(from, RequestStatus.NEW)).toBe(false);
    }
  });

  it('терминальные статусы не имеют исходящих переходов', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(TRANSITIONS[status]).toEqual([]);
      for (const to of ALL_STATUSES) {
        expect(canTransition(status, to)).toBe(false);
      }
    }
  });

  it('переход сразу из NEW в QUOTE_READY невозможен', () => {
    expect(canTransition(RequestStatus.NEW, RequestStatus.QUOTE_READY)).toBe(false);
  });

  it('переход сразу из NEW в ACCEPTED невозможен', () => {
    expect(canTransition(RequestStatus.NEW, RequestStatus.ACCEPTED)).toBe(false);
  });

  it('активными считаются четыре нетерминальных статуса', () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(
      ALL_STATUSES.filter((status) => !TERMINAL_STATUSES.includes(status)).sort(),
    );
  });
});

describe('checkTransition — правило актора', () => {
  it('ACCEPTED и REJECTED доступны только клиенту-владельцу', () => {
    for (const to of CLIENT_ONLY_TRANSITIONS) {
      expect(
        checkTransition({ from: RequestStatus.QUOTE_READY, to, actor: 'CLIENT_OWNER' }),
      ).toEqual({ allowed: true });
      expect(checkTransition({ from: RequestStatus.QUOTE_READY, to, actor: 'STAFF' })).toEqual({
        allowed: false,
        reason: 'WRONG_ACTOR',
      });
    }
  });

  it('рабочие переходы доступны только сотруднику', () => {
    const staffTransitions: Array<[RequestStatus, RequestStatus]> = [
      [RequestStatus.NEW, RequestStatus.IN_PROGRESS],
      [RequestStatus.IN_PROGRESS, RequestStatus.QUOTE_READY],
      [RequestStatus.NEEDS_INFO, RequestStatus.IN_PROGRESS],
      [RequestStatus.QUOTE_READY, RequestStatus.NEEDS_INFO],
    ];
    for (const [from, to] of staffTransitions) {
      expect(
        checkTransition({ from, to, actor: 'STAFF', comment: 'нужен план с масштабом' }),
      ).toEqual({ allowed: true });
      expect(checkTransition({ from, to, actor: 'CLIENT_OWNER', comment: 'что-то' })).toEqual({
        allowed: false,
        reason: 'WRONG_ACTOR',
      });
    }
  });

  it('клиент не может взять свою заявку в работу', () => {
    expect(
      checkTransition({
        from: RequestStatus.NEW,
        to: RequestStatus.IN_PROGRESS,
        actor: 'CLIENT_OWNER',
      }),
    ).toEqual({ allowed: false, reason: 'WRONG_ACTOR' });
  });

  it('сметчик не может принять смету за клиента', () => {
    expect(
      checkTransition({
        from: RequestStatus.QUOTE_READY,
        to: RequestStatus.ACCEPTED,
        actor: 'STAFF',
      }),
    ).toEqual({ allowed: false, reason: 'WRONG_ACTOR' });
  });

  it('недопустимый переход отклоняется раньше проверки актора', () => {
    expect(
      checkTransition({
        from: RequestStatus.ACCEPTED,
        to: RequestStatus.IN_PROGRESS,
        actor: 'STAFF',
      }),
    ).toEqual({ allowed: false, reason: 'INVALID_TRANSITION' });
  });
});

describe('checkTransition — обязательный комментарий', () => {
  it('переход в NEEDS_INFO без комментария отклоняется', () => {
    for (const comment of [undefined, null, '', '   ']) {
      expect(
        checkTransition({
          from: RequestStatus.IN_PROGRESS,
          to: RequestStatus.NEEDS_INFO,
          actor: 'STAFF',
          comment,
        }),
      ).toEqual({ allowed: false, reason: 'COMMENT_REQUIRED' });
    }
  });

  it('с комментарием переход разрешён', () => {
    expect(
      checkTransition({
        from: RequestStatus.IN_PROGRESS,
        to: RequestStatus.NEEDS_INFO,
        actor: 'STAFF',
        comment: 'план БТИ без масштаба',
      }),
    ).toEqual({ allowed: true });
  });

  it('остальные переходы комментария не требуют', () => {
    expect(
      checkTransition({
        from: RequestStatus.NEW,
        to: RequestStatus.IN_PROGRESS,
        actor: 'STAFF',
      }),
    ).toEqual({ allowed: true });
  });
});

describe('isStaffRole', () => {
  it('сметчик и админ — сотрудники, клиент — нет', () => {
    expect(isStaffRole(UserRole.ESTIMATOR)).toBe(true);
    expect(isStaffRole(UserRole.ADMIN)).toBe(true);
    expect(isStaffRole(UserRole.CLIENT)).toBe(false);
  });
});
