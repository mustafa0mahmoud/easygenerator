import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({
  collection: 'refresh_tokens',
  timestamps: { createdAt: true, updatedAt: false },
})
export class RefreshToken {
  /** Indexed so every session of a user can be revoked in one operation. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  /** SHA-256 of the token. The token itself only ever exists in the cookie. */
  @Prop({ type: String, required: true, unique: true })
  tokenHash: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// MongoDB removes expired tokens by itself.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
