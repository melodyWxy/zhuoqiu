import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * 业务异常：HTTP 200，但 body.code != 0
 * 与普通 HttpException 区分，专用于"业务失败但非服务器异常"。
 */
export class BusinessException extends HttpException {
  constructor(
    public readonly code: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super({ code, message, details }, HttpStatus.OK)
  }
}

// 错误码常量（对应 shared-match-backend.md §5.3）
export const ErrorCode = {
  // 通用
  BAD_REQUEST: 10001,
  UNAUTHORIZED: 10002,
  FORBIDDEN: 10003,
  RATE_LIMITED: 10004,

  // 登录 / 账号
  LOGIN_FAILED: 20001,
  ACCOUNT_BANNED: 20002,
  ACCOUNT_LOCKED: 20003,
  SMS_CODE_INVALID: 20004,

  // 比赛
  MATCH_NOT_FOUND: 40001,
  MATCH_CODE_EXPIRED: 40002,
  MATCH_FULL: 40003,
  MATCH_STATE_INVALID: 40004,
  MATCH_EVENT_CONFLICT: 40005,

  // 管理端
  ADMIN_PERMISSION_DENIED: 50001,

  // 球房 / 商家（v2.10）
  VENUE_NOT_FOUND: 60001,
  VENUE_APPLICATION_NOT_FOUND: 60002,
  VENUE_APPLICATION_STATE_INVALID: 60003,
  VENUE_ONLY_ADMIN_WEB: 60010, // 当前客户端无权执行此写操作，请到管理后台

  // 服务端
  INTERNAL_ERROR: 90001
} as const
