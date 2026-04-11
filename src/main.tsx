import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './i18n/LocaleContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
