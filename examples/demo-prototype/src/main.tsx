import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@organiser/sdk';
import { App } from './App';

// Register variants and states with the Organiser viewer. Outside the viewer
// this is a no-op and the prototype uses the defaults.
init({
  variants: ['A', 'B', 'C'],
  states: {
    mode: ['During', 'Brief', 'Paused', 'Generated'],
    crm: ['None', 'Attio', 'HubSpot', 'Salesforce'],
  },
  defaultStates: { crm: 'Attio' },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
