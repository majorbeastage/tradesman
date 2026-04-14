import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/mobile-app.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './i18n/LocaleContext'
import NativeMobilePipeline from './components/NativeMobilePipeline'
import NativePermissionOnboarding from './components/NativePermissionOnboarding'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <NativeMobilePipeline />
        <NativePermissionOnboarding />
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
