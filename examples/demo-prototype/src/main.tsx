import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@organiser/sdk';
import { App } from './App';
import './styles.css';

// Register variants and states with the Organiser viewer. Outside the viewer
// this is a no-op and the prototype uses the defaults.
init({
  variants: ['Static', 'Carousel'],
  states: { form: ['Empty', 'Filled', 'Error'] },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
