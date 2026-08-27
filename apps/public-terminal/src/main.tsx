import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../web/src/styles/global.css';
import './public.css';
import { PublicApp } from '../../web/src/public/PublicApp';

document.title = 'VTS Public Terminal';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicApp />
  </StrictMode>,
);
