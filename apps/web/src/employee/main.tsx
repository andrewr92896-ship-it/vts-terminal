import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';
import './fonts.css';
import { EmployeeApp } from './EmployeeApp';

// The employee portal's entry point — a second, independent Vite entry
// (employee.html), not a route inside the main single-page app.
//
// Note what is deliberately absent compared to src/main.tsx: no AuthProvider
// (the main portal's session has no authority here), no service-worker
// registration, no PWA install prompt, no push subscription. This surface is
// always served fresh from the network and holds nothing on the device.

document.title = 'Employee Portal — Vitalis Trading Systems';

createRoot(document.getElementById('employee-root')!).render(
  <StrictMode>
    <EmployeeApp />
  </StrictMode>,
);
