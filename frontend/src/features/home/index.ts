/** The home feature's public surface. Pages are loaded on first visit. */
export const homePages = {
  welcome: () => import('./pages/Welcome.tsx'),
  profile: () => import('./pages/Profile.tsx'),
};

export { AccountMenu } from './components/AccountMenu.tsx';
