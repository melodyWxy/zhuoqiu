import 'dotenv/config'
import { AdminRole, AdminStatus, PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`
}

async function main() {
  const username = process.env.SEED_SUPER_ADMIN_USERNAME ?? 'admin'
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin@123456'
  const name = process.env.SEED_SUPER_ADMIN_NAME ?? '超级管理员'

  const existing = await prisma.adminAccount.findUnique({ where: { username } })
  if (existing) {
    console.log(`[seed] super admin '${username}' 已存在，跳过创建`)
  } else {
    const hash = await bcrypt.hash(password, 10)
    const account = await prisma.adminAccount.create({
      data: {
        id: genId('a'),
        username,
        name,
        passwordHash: hash,
        role: AdminRole.super_admin,
        status: AdminStatus.active,
        mustChangePassword: false,
        notes: '种子脚本创建；请首次登录后修改密码'
      }
    })
    console.log(`[seed] super admin created:`)
    console.log(`  id:       ${account.id}`)
    console.log(`  username: ${account.username}`)
    console.log(`  password: ${password}  (仅首次展示)`)
  }

  // 默认系统设置
  const defaults: Array<{ key: string; value: unknown }> = [
    { key: 'match.code_expire_hours', value: 24 },
    { key: 'match.reconnect_window_sec', value: 60 },
    { key: 'match.zombie_pause_minutes', value: 15 },
    { key: 'match.zombie_end_minutes', value: 120 },
    { key: 'match.max_concurrent_per_user', value: 3 },
    { key: 'auth.login_fail_threshold', value: 5 },
    { key: 'auth.login_lock_minutes', value: 15 },
    { key: 'auth.require_manual_review_on_signup', value: false }
  ]
  for (const s of defaults) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, valueJson: s.value as object },
      update: {} // 已存在则不覆盖
    })
  }
  console.log(`[seed] system_settings 默认值就绪（${defaults.length} 条）`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('[seed] error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
