import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MatchController } from './match.controller'
import { MatchService } from './match.service'

@Module({
  imports: [AuthModule],
  controllers: [MatchController],
  providers: [MatchService],
  exports: [MatchService]
})
export class MatchModule {}
