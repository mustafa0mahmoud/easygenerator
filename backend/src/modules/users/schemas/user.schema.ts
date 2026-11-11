import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'users', timestamps: true })
export class User {
  /** Stored lowercase; the unique index is what makes sign-up race-safe. */
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** Excluded from queries unless selected explicitly. */
  @Prop({ type: String, required: true, select: false })
  passwordHash: string;

  @Prop({ type: Date, default: null })
  emailVerifiedAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
