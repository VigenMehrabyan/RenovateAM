import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { AuthProvider } from '@/features/auth/auth-context';
import type { AuthUser } from '@/lib/api-types';

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    fullName: 'Արամ Պետրոսյան',
    email: 'aram@example.am',
    role: 'CLIENT',
    locale: 'RU',
    emailVerified: true,
    ...overrides,
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options: { user?: AuthUser | null; route?: string } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>
          <AuthProvider initialUser={options.user ?? null} skipBootstrap>
            {children}
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );

  return render(ui, { wrapper });
}
