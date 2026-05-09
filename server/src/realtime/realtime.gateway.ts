import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets'
import type { WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import { AdminRole } from '@prisma/client'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeService } from './realtime.service'
import { AdminJwtPayload, UserJwtPayload } from '../auth/jwt-payload'

interface ZqWebSocket extends WebSocket {
  _identity?:
    | { type: 'user'; userId: string }
    | { type: 'admin'; adminId: string; role: AdminRole }
  _isAlive?: boolean
}

@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name)

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService
  ) {}

  async handleConnection(client: ZqWebSocket, request: IncomingMessage) {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const token = url.searchParams.get('token')
      const channel = url.searchParams.get('channel') ?? 'user' // 'user' | 'admin'
      if (!token) return client.close(4001, 'no token')

      if (channel === 'admin') {
        let payload: AdminJwtPayload
        try {
          payload = this.authService.verifyAdminAccessToken(token)
        } catch {
          return client.close(4001, 'invalid admin token')
        }
        client._identity = {
          type: 'admin',
          adminId: payload.sub,
          role: payload.role
        }
      } else {
        let payload: UserJwtPayload
        try {
          payload = this.authService.verifyUserAccessToken(token)
        } catch {
          return client.close(4001, 'invalid user token')
        }
        client._identity = { type: 'user', userId: payload.sub }
      }

      client._isAlive = true
      client.on('pong', () => {
        client._isAlive = true
      })

      this.send(client, { op: 'hello', data: { identity: client._identity } })
    } catch (e) {
      this.logger.error('handleConnection error', (e as Error).stack)
      client.close(4006, 'protocol error')
    }
  }

  handleDisconnect(client: ZqWebSocket) {
    this.realtime.onDisconnect(client)
  }

  @SubscribeMessage('subscribe_match')
  async onSubscribeMatch(
    @ConnectedSocket() client: ZqWebSocket,
    @MessageBody() data: { matchId: string; afterSeq?: number }
  ) {
    if (!client._identity) return this.send(client, { op: 'error', data: { code: 4001 } })
    const match = await this.prisma.match.findUnique({
      where: { id: data.matchId }
    })
    if (!match) {
      return this.send(client, {
        op: 'error',
        data: { code: 40001, message: '房间不存在' }
      })
    }
    this.realtime.subscribeMatch(client, data.matchId)

    // 推送增量事件（重连场景）
    if (typeof data.afterSeq === 'number') {
      const events = await this.prisma.matchEvent.findMany({
        where: { matchId: data.matchId, serverSeq: { gt: BigInt(data.afterSeq) } },
        orderBy: { serverSeq: 'asc' },
        take: 200
      })
      for (const e of events) {
        this.send(client, {
          op: 'match_event',
          data: {
            matchId: data.matchId,
            event: {
              ...e,
              id: Number(e.id),
              serverSeq: Number(e.serverSeq),
              clientSeq: e.clientSeq ? Number(e.clientSeq) : null,
              undoneByEventId: e.undoneByEventId ? Number(e.undoneByEventId) : null
            }
          }
        })
      }
    }

    this.send(client, { op: 'ack', data: { for: 'subscribe_match', matchId: data.matchId } })
  }

  @SubscribeMessage('unsubscribe_match')
  onUnsubscribeMatch(
    @ConnectedSocket() client: ZqWebSocket,
    @MessageBody() data: { matchId: string }
  ) {
    this.realtime.unsubscribeMatch(client, data.matchId)
    this.send(client, { op: 'ack', data: { for: 'unsubscribe_match', matchId: data.matchId } })
  }

  @SubscribeMessage('subscribe_all')
  onSubscribeAll(@ConnectedSocket() client: ZqWebSocket) {
    if (
      !client._identity ||
      client._identity.type !== 'admin' ||
      (client._identity.role !== AdminRole.super_admin &&
        client._identity.role !== AdminRole.operator &&
        client._identity.role !== AdminRole.readonly)
    ) {
      return this.send(client, { op: 'error', data: { code: 4003, message: '需管理员身份' } })
    }
    this.realtime.subscribeAll(client)
    this.send(client, { op: 'ack', data: { for: 'subscribe_all' } })
  }

  @SubscribeMessage('heartbeat')
  onHeartbeat(@ConnectedSocket() client: ZqWebSocket) {
    client._isAlive = true
    this.send(client, { op: 'heartbeat_ack' })
  }

  private send(client: WebSocket, msg: object): void {
    try {
      if (client.readyState === 1 /* OPEN */) {
        client.send(JSON.stringify(msg))
      }
    } catch {
      // ignore
    }
  }
}
