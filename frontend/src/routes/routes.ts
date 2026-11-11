import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { PageLoader } from '../components/ui/PageLoader.tsx';
import { authPages } from '../features/auth/index.ts';
import { homePages } from '../features/home/index.ts';
import { AppLayout } from './AppLayout.tsx';
import { GuestOnly, RequireAuth } from './guards.tsx';
import { PATHS } from './paths.ts';
import { RootLayout } from './RootLayout.tsx';
import { RouteError } from './RouteError.tsx';

type PageModule = { default: ComponentType };

/**
 * Route-level code splitting: the page's module is requested when the route
 * is first matched, so each page ships as its own chunk and a visitor to the
 * sign-in page never downloads the rest of the application.
 */
const lazyPage = (load: () => Promise<PageModule>) => async () => ({
  Component: (await load()).default,
});

export const routes: RouteObject[] = [
  {
    Component: RootLayout,
    // Also catches a page chunk that fails to download.
    ErrorBoundary: RouteError,
    HydrateFallback: PageLoader,
    children: [
      {
        Component: RequireAuth,
        children: [
          {
            Component: AppLayout,
            children: [
              { path: PATHS.home, lazy: lazyPage(homePages.welcome) },
              { path: PATHS.profile, lazy: lazyPage(homePages.profile) },
            ],
          },
        ],
      },
      {
        Component: GuestOnly,
        children: [
          { path: PATHS.signIn, lazy: lazyPage(authPages.signIn) },
          { path: PATHS.signUp, lazy: lazyPage(authPages.signUp) },
          { path: PATHS.verifyEmail, lazy: lazyPage(authPages.verifyEmail) },
          {
            path: PATHS.forgotPassword,
            lazy: lazyPage(authPages.forgotPassword),
          },
          {
            path: PATHS.resetPassword,
            lazy: lazyPage(authPages.resetPassword),
          },
        ],
      },
      { path: '*', lazy: lazyPage(() => import('./NotFound.tsx')) },
    ],
  },
];
