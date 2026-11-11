import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const ONE_TIME_CODE_PURPOSES = [
  'email_verification',
  'password_reset',
] as const;
export type OneTimeCodePurpose = (typeof ONE_TIME_CODE_PURPOSES)[number];

@Schema({ collection: 'one_time_codes' })
export class OneTimeCode {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ONE_TIME_CODE_PURPOSES })
  purpose: OneTimeCodePurpose;

  /** HMAC of the code. The code itself is never stored. */
  @Prop({ type: String, required: true })
  codeHash: string;

  /** Wrong guesses so far. The code is destroyed when the limit is reached. */
  @Prop({ type: Number, required: true, default: 0 })
  attempts: number;

  @Prop({ type: Date, required: true })
  issuedAt: Date;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const OneTimeCodeSchema = SchemaFactory.createForClass(OneTimeCode);

// One live code per user and purpose: issuing a new one replaces the old one.
OneTimeCodeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
// MongoDB removes expired codes by itself.
OneTimeCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
