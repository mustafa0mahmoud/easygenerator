import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opens a route or a whole controller to unauthenticated callers.
 * Every route is protected unless it carries this decorator, so forgetting it
 * fails closed (401) rather than exposing an endpoint.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
