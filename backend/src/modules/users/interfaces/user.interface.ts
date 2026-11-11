import type { Types } from 'mongoose';

/** What the rest of the application sees of a user. Never includes the password hash. */
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
}

export interface UserCredentials extends UserRecord {
  passwordHash: string;
}

export interface LeanUser {
  _id: Types.ObjectId;
  email: string;
  name: string;
  emailVerifiedAt?: Date | null;
  createdAt: Date;
}
