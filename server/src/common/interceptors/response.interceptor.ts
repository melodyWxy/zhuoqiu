import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { Request } from 'express'
import { randomUUID } from 'crypto'

export interface ApiResponse<T = any> {
  code: 0
  data: T
  traceId: string
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<ApiResponse<T>> {
    const req = context.switchToHttp().getRequest<Request>()
    const traceId =
      (req.headers['x-trace-id'] as string) ?? randomUUID().replace(/-/g, '').slice(0, 16)

    return next.handle().pipe(
      map((data) => ({
        code: 0 as const,
        data,
        traceId
      }))
    )
  }
}
