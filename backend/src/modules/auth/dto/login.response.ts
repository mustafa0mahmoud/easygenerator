import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from '../../users/dto/user.response.js';

/** The signed-in user. Tokens travel only in HttpOnly cookies, never here. */
export class LoginResponse {
  @ApiProperty({ type: UserResponse })
  user: UserResponse;
}
