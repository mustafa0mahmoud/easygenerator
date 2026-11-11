import { render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './routes.ts';

describe('route error page', () => {
  it('is shown when a page chunk fails to load, without the error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const [root] = routes;
    const broken: RouteObject[] = [
      {
        Component: root.Component,
        ErrorBoundary: root.ErrorBoundary,
        children: [
          {
            path: '/broken',
            lazy: () => Promise.reject(new Error('chunk missing')),
          },
        ],
      },
    ];
    const router = createMemoryRouter(broken, { initialEntries: ['/broken'] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    );
    expect(screen.queryByText('chunk missing')).not.toBeInTheDocument();
  });
});
