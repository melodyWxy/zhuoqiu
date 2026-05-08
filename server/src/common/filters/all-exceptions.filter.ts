import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common'
import { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { BusinessException, ErrorCode } from '../exceptions/business.exception'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const traceId =
      (request.headers['x-trace-id'] as string) ??
      randomUUID().replace(/-/g, '').slice(0, 16)

    // 业务异常（HTTP 200，body 带 code）
    if (exception instanceof BusinessException) {
      const resp = exception.getResponse() as {
        code: number
        message: string
        details?: Record<string, unknown>
      }
      response.status(HttpStatus.OK).json({
        code: resp.code,
        message: resp.message,
        details: resp.details,
        traceId
      })
      return
    }

    // NestJS HttpException（比如 401 / 403 / validation 400 等）
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const resp = exception.getResponse()
      const message =
        typeof resp === 'string'
          ? resp
          : ((resp as Record<string, unknown>)['message'] as string) ?? exception.message

      const mappedCode = this.mapStatusToCode(status)
      response.status(status).json({
        code: mappedCode,
        message,
        traceId
      })
      return
    }

    // 未知异常 → 500
    this.logger.error(
      `Unhandled exception [${traceId}]`,
      (exception as Error)?.stack ?? String(exception)
    )
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: '服务异常，稍后再试',
      traceId
    })
  }

  private mapStatusToCode(status: number): number {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED
      default:
        return ErrorCode.INTERNAL_ERROR
    }
  }
}
