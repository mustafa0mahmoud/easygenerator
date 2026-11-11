import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from './routes.ts';

const router = createBrowserRouter(routes);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
