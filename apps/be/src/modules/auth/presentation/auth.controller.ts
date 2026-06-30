import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../../../common/http/zod-validation.pipe';
import { AuthService } from '../application/auth.service';

const DevLoginSchema = z.object({ email: z.string().email() });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('dev-login')
  async devLogin(@Body(zodBody(DevLoginSchema)) body: z.infer<typeof DevLoginSchema>) {
    return this.auth.devLogin(body.email);
  }
}
