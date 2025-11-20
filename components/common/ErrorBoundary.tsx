import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                    <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                        <h1 className="text-2xl font-bold text-red-600 mb-4">Oups ! Une erreur est survenue.</h1>
                        <p className="text-gray-600 mb-6">
                            Nous sommes désolés, mais quelque chose s'est mal passé. Veuillez essayer de rafraîchir la page.
                        </p>
                        {this.state.error && (
                            <div className="mb-6 p-4 bg-red-50 rounded text-left overflow-auto max-h-40 text-xs text-red-800 font-mono">
                                {this.state.error.toString()}
                            </div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
                        >
                            Rafraîchir la page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
