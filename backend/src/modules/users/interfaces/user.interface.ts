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

/** A user together with the stored password hash. Only sign-in needs this. */
export interface UserCredentials extends UserRecord {
  passwordHash: string;
}

/** A user document as MongoDB returns it, before it is mapped to a `UserRecord`. */
export interface LeanUser {
  _id: Types.ObjectId;
  email: string;
  name: string;
  emailVerifiedAt?: Date | null;
  /** Written by Mongoose (`timestamps: true`) when the document is created. */
  createdAt: Date;
}
