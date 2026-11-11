import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { UserResponse } from '../users/dto/user.response.js';
import { AUTH_MESSAGES, AUTH_RATE_LIMITS } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import {
  forgotPasswordSchema,
  type ForgotPasswordDto,
} from './dto/forgot-password.dto.js';
import { loginSchema, type LoginDto } from './dto/login.dto.js';
import { LoginResponse } from './dto/login.response.js';
import { MessageResponse } from './dto/message.response.js';
import {
  resendVerificationSchema,
  type ResendVerificationDto,
} from './dto/resend-verification.dto.js';
import {
  resetPasswordSchema,
  type ResetPasswordDto,
} from './dto/reset-password.dto.js';
import { signupSchema, type SignupDto } from './dto/signup.dto.js';
import {
  verifyEmailSchema,
  type VerifyEmailDto,
} from './dto/verify-email.dto.js';
import { PasswordResetService } from './password-reset/password-reset.service.js';
import { AuthCookies } from './sessions/auth-cookies.js';

/**
 * Every route here is reachable without a session: that is the point of them.
 * The controller only translates between HTTP (bodies, cookies, status codes)
 * and the service; it holds no rules of its own.
 */
@ApiTags('auth')
@ApiTooManyRequestsResponse({
  description: 'Too many requests from this client.',
})
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly cookies: AuthCookies,
  ) {}

  @Post('signup')
  @Throttle({ default: AUTH_RATE_LIMITS.signup })
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Creates an unverified account and emails a 6-digit verification code. ' +
      'An address that is already registered, verified or not, is rejected with 409.',
  })
  @ApiCreatedResponse({ type: MessageResponse })
  @ApiBadRequestResponse({
    description: 'A field does not meet the requirements.',
  })
  @ApiConflictResponse({
    description: 'The email address is already registered.',
  })
  async signUp(
    @Body({ schema: signupSchema }) dto: SignupDto,
  ): Promise<MessageResponse> {
    await this.auth.signUp(dto);
    return { message: AUTH_MESSAGES.signupCreated };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_RATE_LIMITS.verifyEmail })
  @ApiOperation({
    summary: 'Verify an email address with the emailed code',
    description:
      'A code is valid for 5 minutes and is destroyed after 5 wrong attempts. ' +
      'Every failure returns the same error.',
  })
  @ApiOkResponse({ type: MessageResponse })
  @ApiBadRequestResponse({
    description: 'Invalid or expired verification code.',
  })
  async verifyEmail(
    @Body({ schema: verifyEmailSchema }) dto: VerifyEmailDto,
  ): Promise<MessageResponse> {
    await this.auth.verifyEmail(dto);
    return { message: AUTH_MESSAGES.emailVerified };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: AUTH_RATE_LIMITS.resendVerification })
  @ApiOperation({
    summary: 'Send a new verification code',
    description:
      'Always answers the same way. A new code replaces the previous one and can be ' +
      'requested at most once per minute per address.',
  })
  @ApiAcceptedResponse({ type: MessageResponse })
  @ApiBadRequestResponse({ description: 'The email address is malformed.' })
  async resendVerification(
    @Body({ schema: resendVerificationSchema }) dto: ResendVerificationDto,
  ): Promise<MessageResponse> {
    await this.auth.resendVerification(dto);
    return { message: AUTH_MESSAGES.verificationResent };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_RATE_LIMITS.login })
  @ApiOperation({
    summary: 'Sign in',
    description:
      'On success sets two HttpOnly cookies: a short-lived access token and a ' +
      'single-use refresh token. The tokens are never part of the response body.',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  @ApiForbiddenResponse({
    description:
      'Correct password, but the email is not verified (code: email_not_verified).',
  })
  async login(
    @Body({ schema: loginSchema }) dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const { user, tokens } = await this.auth.login(dto);
    this.cookies.set(response, tokens);
    return { user: UserResponse.from(user) };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: AUTH_RATE_LIMITS.refresh })
  @ApiOperation({
    summary: 'Renew the session',
    description:
      'Exchanges the refresh-token cookie for a new pair of cookies. The old refresh ' +
      'token stops working immediately.',
  })
  @ApiNoContentResponse({ description: 'New cookies set.' })
  @ApiUnauthorizedResponse({ description: 'No live refresh token.' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // On failure the cookies are deliberately left alone: another tab may
    // have refreshed a moment ago, and clearing would wipe its new cookies.
    const tokens = await this.auth.refresh(
      this.cookies.readRefreshToken(request),
    );
    this.cookies.set(response, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the refresh token server-side and clears both cookies. Works with an ' +
      'expired access token and is safe to call twice.',
  })
  @ApiNoContentResponse({ description: 'Signed out.' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookies.readRefreshToken(request));
    this.cookies.clear(response);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: AUTH_RATE_LIMITS.forgotPassword })
  @ApiOperation({
    summary: 'Ask for a password reset code',
    description:
      'Always answers the same way, whether or not the address has an account. A code ' +
      'can be requested at most once per minute per address.',
  })
  @ApiAcceptedResponse({ type: MessageResponse })
  @ApiBadRequestResponse({ description: 'The email address is malformed.' })
  async forgotPassword(
    @Body({ schema: forgotPasswordSchema }) dto: ForgotPasswordDto,
  ): Promise<MessageResponse> {
    await this.passwordReset.request(dto);
    return { message: AUTH_MESSAGES.passwordResetRequested };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_RATE_LIMITS.resetPassword })
  @ApiOperation({
    summary: 'Choose a new password with the emailed code',
    description:
      'A code is valid for 5 minutes and is destroyed after 5 wrong attempts. On success ' +
      'every existing session of the account is ended and the email address counts as ' +
      'verified. The user is not signed in: they sign in with the new password.',
  })
  @ApiOkResponse({ type: MessageResponse })
  @ApiBadRequestResponse({
    description:
      'Invalid or expired reset code, or the new password does not meet the rules.',
  })
  async resetPassword(
    @Body({ schema: resetPasswordSchema }) dto: ResetPasswordDto,
  ): Promise<MessageResponse> {
    await this.passwordReset.reset(dto);
    return { message: AUTH_MESSAGES.passwordReset };
  }
}
