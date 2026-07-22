import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/mobile-app.css'
import './styles/appSchemes.css'
import './styles/schemeContrast.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LocaleProvider } from './i18n/LocaleContext'
import NativeMobilePipeline from './components/NativeMobilePipeline'
import MainAppSessionGuard from './components/MainAppSessionGuard'
import { Capacitor } from '@capacitor/core'

// Attach IM push-tap → Messaging handoff before React mounts (cold-start taps).
if (Capacitor.isNativePlatform()) {
  void import('./lib/mainAppPushTap').then((m) => void m.initMainAppPushTapListener())
}

function SessionGuardHost() {
  const { user } = useAuth()
  return <MainAppSessionGuard userId={user?.id ?? null} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <NativeMobilePipeline />
        <SessionGuardHost />
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
