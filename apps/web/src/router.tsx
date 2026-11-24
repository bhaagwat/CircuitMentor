import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App';

/**
 * React Router v6+ Route Definitions for CircuitMentor:
 * - "/"           -> Landing / Home
 * - "/dashboard"   -> Dashboard (Circuits, Labs, Analytics)
 * - "/workbench"   -> Circuit Workbench (Schematic Canvas & Mentor)
 * - "/login"       -> Google Auth & Sign-in
 * - "*"           -> Fallback redirect to "/"
 */
export const routes = [
  {
    path: '/',
    element: <App initialScreen="landing" />,
  },
  {
    path: '/dashboard',
    element: <App initialScreen="dashboard" />,
  },
  {
    path: '/workbench',
    element: <App initialScreen="editor" />,
  },
  {
    path: '/workbench/:projectId',
    element: <App initialScreen="editor" />,
  },
  {
    path: '/login',
    element: <App initialScreen="login" />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];

export const router = createBrowserRouter(routes);
export default router;
