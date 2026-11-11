import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';

const DATABASE_PING_TIMEOUT_MS = 1500;

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness and database connectivity',
    description: 'Returns 200 when the API can reach MongoDB, 503 otherwise.',
  })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.mongoose
          .pingCheck('mongodb')
          .withTimeout(DATABASE_PING_TIMEOUT_MS),
    ]);
  }
}
