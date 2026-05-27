---
date: 2026-05-27
version: v2.20.x
title: 球房入驻表单态加退出按钮 + 三按钮拉成全宽
---

# 球房入驻表单态加退出按钮 + 三按钮拉成全宽

## 动机
用户在小程序商家身份登录后进入「查看 / 完成申请」（`/pages/venue-apply`）反馈两点：

1. 申请表单分支（首次未提交、或被驳回）下方只有「提交审核」+「稍后再说」，**没有退出商家登录按钮**——只有走完表单成功状态、或申请进入 pending 时才出现。这条路径其实是商家最常停留的页面，应该一直能退。
2. 「提交审核」/「稍后再说」按钮宽度只占一部分，「选择图片上传」同样窄。期望横向占满，靠卡片本身的内边距留侧边距。

## PRD / 设计变化
PRD 仅描述球房入驻的整体流程（`prd/billiards-match-app-prd-v2.md` §5），对按钮宽度 / 退出登录入口位置没有具体描述，本次属于纯 UI 对齐，不动 PRD。

## 代码变化

### 客户端
- `billiards-score/src/pages/venue-apply/index.tsx`：
  - 表单分支「稍后再说」之后追加 `<Button className='va-btn-logout'>退出商家登录</Button>`，复用现有 `handleLogout`。
  - 状态卡（pending）和成功卡（已绑定 venue）两处现有「退出商家登录」按钮，class 从 `va-btn-secondary` 改为新 `va-btn-logout`，与表单态视觉对齐。
- `billiards-score/src/pages/venue-apply/index.scss`：
  - `.va-btn-primary` / `.va-btn-secondary` / `.va-btn-upload` 统一加 `width: 100%; box-sizing: border-box;`。weapp `<Button>` 默认不撑满，需显式给宽。
  - 新增 `.va-btn-logout`：与 `secondary` 同尺寸（`padding: 12px; font-size: 14px;`），背景 / 边框 / 文字色走 `--error` 区分（淡红底 + 红边 + 红字）。

### 服务端
无改动。

## 验证步骤
- [ ] `npm run build:weapp:prod` 构建通过
- [ ] 商家登录但**未提交过申请** → 进「查看 / 完成申请」→ 看到表单 + 提交审核 + 稍后再说 + 退出商家登录（红色调）三按钮，三者宽度一致且都横向占满（左右有 16px 卡片内边距）
- [ ] 选择图片上传按钮：在未上传执照时同样横向占满
- [ ] 申请已被驳回的状态：表单上方有红色 rejected 卡，下方按钮组同上（含退出按钮）
- [ ] 申请 pending 状态：状态卡下方「退出商家登录」按钮变红色调
- [ ] 已绑定 venue 的成功页：「退出商家登录」按钮变红色调
- [ ] 点退出：调 `/venue-auth/logout` → 清 venueSession → 切到 `/pages/me/index`

## 上线必做
- 客户端：`npm run build:weapp:prod` 重打包，开发者工具上传
- 服务端：无

## 遗留问题 / 已知限制
- 「重新上传」按钮仍是 mini size 的 text 按钮（执照已上传后展示），未拉宽——属于次要操作，保留窄样式。
