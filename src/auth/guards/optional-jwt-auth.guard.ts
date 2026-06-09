import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return true;
    }
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  handleRequest<TUser>(_err: unknown, user: TUser): TUser | undefined {
    return user ?? undefined;
  }
}
