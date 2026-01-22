'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';

interface ErrorBoundaryStrings {
  title: string;
  description: string;
  tryAgain: string;
  reloadPage: string;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  strings?: ErrorBoundaryStrings;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component to catch React errors and display a fallback UI.
 * Prevents entire app from crashing when a component throws an error.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console (could be sent to error tracking service)
    console.error('Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const strings: ErrorBoundaryStrings = this.props.strings ?? {
      title: 'Something Went Wrong',
      description: 'An unexpected error occurred. This has been logged for review.',
      tryAgain: 'Try Again',
      reloadPage: 'Reload Page',
    };

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-[#F0F0E8]">
          <div className="max-w-md w-full bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] p-8">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              <h2 className="font-serif text-2xl font-bold uppercase">{strings.title}</h2>
            </div>

            <p className="text-gray-600 mb-4 font-mono text-sm">{strings.description}</p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-none">
                <p className="font-mono text-xs text-red-700 break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={this.handleReset}
                variant="outline"
                className="flex-1 border-black rounded-none shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
              >
                {strings.tryAgain}
              </Button>
              <Button
                onClick={this.handleReload}
                className="flex-1 bg-blue-700 hover:bg-blue-800 text-white rounded-none border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {strings.reloadPage}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap any component with an error boundary.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export function LocalizedErrorBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { t } = useTranslations();
  const strings: ErrorBoundaryStrings = {
    title: t('errors.boundary.title'),
    description: t('errors.boundary.description'),
    tryAgain: t('errors.boundary.tryAgain'),
    reloadPage: t('errors.boundary.reloadPage'),
  };

  return (
    <ErrorBoundary fallback={fallback} strings={strings}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
