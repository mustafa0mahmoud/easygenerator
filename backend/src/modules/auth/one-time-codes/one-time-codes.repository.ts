import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isDuplicateKeyError } from '../../../common/database/mongo-errors.js';
import type {
  NewCode,
  StoredCode,
} from './interfaces/one-time-code.interface.js';
import {
  OneTimeCode,
  type OneTimeCodePurpose,
} from './schemas/one-time-code.schema.js';

@Injectable()
export class OneTimeCodesRepository {
  constructor(
    @InjectModel(OneTimeCode.name)
    private readonly codeModel: Model<OneTimeCode>,
  ) {}

  async replace(
    userId: string,
    purpose: OneTimeCodePurpose,
    code: NewCode,
  ): Promise<void> {
    const upsert = () =>
      this.codeModel
        .updateOne(
          this.key(userId, purpose),
          { $set: { ...code, attempts: 0 } },
          { upsert: true },
        )
        .exec();

    try {
      await upsert();
    } catch (error) {
      // Two concurrent upserts can both try to insert; the loser retries as an update.
      if (!isDuplicateKeyError(error)) throw error;
      await upsert();
    }
  }

  async find(
    userId: string,
    purpose: OneTimeCodePurpose,
  ): Promise<StoredCode | null> {
    return this.codeModel
      .findOne(this.key(userId, purpose))
      .lean<StoredCode>()
      .exec();
  }

  /**
   * Counts one guess and returns the code to compare against, in a single
   * atomic step. Returns `null` when there is no live code or no guesses left,
   * so concurrent requests cannot get more attempts than the limit.
   */
  async consumeAttempt(
    userId: string,
    purpose: OneTimeCodePurpose,
    now: Date,
    maxAttempts: number,
  ): Promise<StoredCode | null> {
    return this.codeModel
      .findOneAndUpdate(
        {
          ...this.key(userId, purpose),
          expiresAt: { $gt: now },
          attempts: { $lt: maxAttempts },
        },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' },
      )
      .lean<StoredCode>()
      .exec();
  }

  async delete(userId: string, purpose: OneTimeCodePurpose): Promise<void> {
    await this.codeModel.deleteOne(this.key(userId, purpose)).exec();
  }

  private key(userId: string, purpose: OneTimeCodePurpose) {
    return { userId: new Types.ObjectId(userId), purpose };
  }
}
