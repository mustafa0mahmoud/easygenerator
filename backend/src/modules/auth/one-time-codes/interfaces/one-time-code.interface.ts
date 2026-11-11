export interface StoredCode {
  codeHash: string;
  attempts: number;
  issuedAt: Date;
  expiresAt: Date;
}

export type NewCode = Pick<StoredCode, 'codeHash' | 'issuedAt' | 'expiresAt'>;

export interface IssuedCode {
  /** Plain code, to be delivered to the user and never stored or logged. */
  code: string;
  expiresAt: Date;
}
