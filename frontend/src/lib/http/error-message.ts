import { ApiError, NetworkError } from './errors.ts';

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_MIN_STATUS = 500;

/**
 * The sentence shown to a person for a failed request.
 *
 * The API's 4xx messages are written for users and reveal nothing by design
 * (one message for every wrong-credentials case, for example), so they are
 * shown as they are. Anything else gets a fixed sentence: a 5xx body or an
 * unexpected exception is never put on screen.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return error.reason === 'timeout'
      ? 'The server is taking too long to respond. Please try again.'
      : 'Could not reach the server. Check your connection and try again.';
  }
  if (error instanceof ApiError) {
    if (error.status === TOO_MANY_REQUESTS) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (error.status < SERVER_ERROR_MIN_STATUS) return error.message;
  }
  return 'Something went wrong on our side. Please try again.';
}
