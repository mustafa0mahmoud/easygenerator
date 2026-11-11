import { ApiProperty } from '@nestjs/swagger';

export class MessageResponse {
  @ApiProperty({ example: 'Email verified. You can now sign in.' })
  message: string;
}
