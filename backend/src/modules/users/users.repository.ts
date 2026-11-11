import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isDuplicateKeyError } from '../../common/database/mongo-errors.js';
import type {
  LeanUser,
  NewUser,
  UserCredentials,
  UserRecord,
} from './interfaces/user.interface.js';
import { User } from './schemas/user.schema.js';

function toRecord(user: LeanUser): UserRecord {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
  };
}

/** The only place that talks to the users collection. */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.userModel
      .findOne({ email })
      .lean<LeanUser>()
      .exec();
    return user ? toRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    // An id that is not an ObjectId cannot match anything; asking would throw.
    if (!Types.ObjectId.isValid(id)) return null;

    const user = await this.userModel.findById(id).lean<LeanUser>().exec();
    return user ? toRecord(user) : null;
  }

  /** The only query that loads the password hash, which is otherwise never selected. */
  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const user = await this.userModel
      .findOne({ email })
      .select('+passwordHash')
      .lean<LeanUser & { passwordHash: string }>()
      .exec();
    return user ? { ...toRecord(user), passwordHash: user.passwordHash } : null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    const result = await this.userModel
      .updateOne({ _id: id }, { $set: { passwordHash } })
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * Returns `null` when the address is already taken, including when a
   * concurrent request created it first: the unique index decides the winner.
   */
  async createUnverified(input: NewUser): Promise<UserRecord | null> {
    try {
      const user = await this.userModel.create({
        ...input,
        emailVerifiedAt: null,
      });
      return toRecord(user.toObject<LeanUser>());
    } catch (error) {
      if (isDuplicateKeyError(error)) return null;
      throw error;
    }
  }

  async markEmailVerified(id: string, verifiedAt: Date): Promise<boolean> {
    const result = await this.userModel
      .updateOne(
        { _id: id, emailVerifiedAt: null },
        { $set: { emailVerifiedAt: verifiedAt } },
      )
      .exec();
    return result.matchedCount === 1;
  }
}
