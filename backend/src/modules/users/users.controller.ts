import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { UserResponse } from './dto/user.response.js';
import { UsersRepository } from './users.repository.js';

@ApiTags('users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersRepository) {}

  /** Not marked public, so the global guard requires a valid access token. */
  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiOkResponse({ type: UserResponse })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  async me(@CurrentUser() current: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.users.findById(current.id);

    // A token can outlive its account. It then proves nothing.
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }
    return UserResponse.from(user);
  }
}
