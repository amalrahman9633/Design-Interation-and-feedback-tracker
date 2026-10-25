import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Home } from './routes/Home';
import { LandingPage } from './routes/LandingPage';
import { ProjectPage } from './routes/Project';
import { Viewer } from './routes/Viewer';
import { Compare } from './routes/Compare';
import { CompanionSync } from './sync/companion';
import './styles.css';

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/projects', element: <Home /> },
  { path: '/p/:projectId', element: <ProjectPage /> },
  { path: '/v/:versionId', element: <Viewer /> },
  { path: '/compare/:a/:b', element: <Compare /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CompanionSync />
    <RouterProvider router={router} />
  </StrictMode>,
);
