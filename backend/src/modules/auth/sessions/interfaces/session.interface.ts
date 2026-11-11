/** The pair handed to the browser after sign-in or refresh. */
export interface SessionTokens {
  /** Signed JWT, short-lived, verified without a database lookup. */
  accessToken: string;
  /** Opaque random value, single-use. Only its hash is stored. */
  refreshToken: string;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Claims carried by an access token. */
export interface AccessTokenPayload {
  sub: string;
}
