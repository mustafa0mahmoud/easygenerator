export interface SessionTokens {
  accessToken: string;
  /** Opaque random value, single-use. Only its hash is stored. */
  refreshToken: string;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AccessTokenPayload {
  sub: string;
}
