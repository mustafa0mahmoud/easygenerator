import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { NewRefreshToken } from './interfaces/session.interface.js';
import { RefreshToken } from './schemas/refresh-token.schema.js';

@Injectable()
export class RefreshTokensRepository {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly tokenModel: Model<RefreshToken>,
  ) {}

  async create({
    userId,
    tokenHash,
    expiresAt,
  }: NewRefreshToken): Promise<void> {
    await this.tokenModel.create({
      userId: new Types.ObjectId(userId),
      tokenHash,
      expiresAt,
    });
  }

  /**
   * Finds and deletes a live token in one atomic step, returning its owner.
   * A token can therefore be exchanged exactly once: of two concurrent
   * requests carrying the same token, only one gets a result.
   */
  async consume(tokenHash: string, now: Date): Promise<string | null> {
    const token = await this.tokenModel
      .findOneAndDelete({ tokenHash, expiresAt: { $gt: now } })
      .lean<{ userId: Types.ObjectId }>()
      .exec();
    return token ? token.userId.toString() : null;
  }

  async deleteByHash(tokenHash: string): Promise<boolean> {
    const result = await this.tokenModel.deleteOne({ tokenHash }).exec();
    return result.deletedCount === 1;
  }

  /** Ends every session of a user. Returns how many were ended. */
  async deleteAllForUser(userId: string): Promise<number> {
    const result = await this.tokenModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();
    return result.deletedCount;
  }
}
