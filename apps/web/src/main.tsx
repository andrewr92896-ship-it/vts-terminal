import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import { applyStoredZoom } from './theme/zoom';

// Put the saved zoom in effect before the first render, so the app paints at the
// right size on frame one instead of snapping into place afterwards.
applyStoredZoom();

// Force the tab/window title at runtime so it stays correct even when a stale
// service-worker-cached index.html shell loads with an older <title>.
document.title = 'VTS Terminal';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
