import { ApiProperty } from '@nestjs/swagger';
import type { UserRecord } from '../interfaces/user.interface.js';

/** The public view of a user. Built field by field so nothing else can leak. */
export class UserResponse {
  @ApiProperty({ example: '6af3b54ee384f5296c292f9b' })
  id: string;

  @ApiProperty({ example: 'sara@example.com' })
  email: string;

  @ApiProperty({ example: 'Sara' })
  name: string;

  static from(user: UserRecord): UserResponse {
    return { id: user.id, email: user.email, name: user.name };
  }
}
