import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { UploadModule } from '../upload/upload.module'
import { MeController } from './me.controller'

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [MeController]
})
export class MeModule {}
