import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';

/**
 * Owns the users collection. Other modules go through `UsersRepository`;
 * the Mongoose model is deliberately not exported.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
