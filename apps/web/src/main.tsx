import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';

// Force the tab/window title at runtime so it stays correct even when a stale
// service-worker-cached index.html shell loads with an older <title>.
document.title = 'VTS Portal';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
