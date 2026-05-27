-- AlterTable: users.avatar 兼容微信头像 URL（之前 VarChar(32) 只够装 emoji）
ALTER TABLE "users" ALTER COLUMN "avatar" TYPE VARCHAR(512);
