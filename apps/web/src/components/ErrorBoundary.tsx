import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from './ui';

/**
 * Последний рубеж: без него любая ошибка отрисовки (например, ответ API,
 * не совпавший с контрактом) оставляла пользователя на пустой белой странице
 * без единой подсказки, что делать дальше.
 *
 * Границу нельзя написать хуком — это единственный случай, где React требует
 * классовый компонент.
 */
function Fallback({ onRetry }: { onRetry: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="max-w-prose">
      <Alert tone="danger" title={t('errors.title')}>
        {t('errors.UNKNOWN')}
      </Alert>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        {t('errors.retry')}
      </Button>
    </div>
  );
}

export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode; resetKey?: string }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidUpdate(previous: { children: ReactNode; resetKey?: string }): void {
    // Переход на другой маршрут — повод попробовать ещё раз: сломанным был
    // экран, а не всё приложение.
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Ошибка отрисовки должна остаться в консоли: без неё её негде увидеть.
    console.error('render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <Fallback onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}
