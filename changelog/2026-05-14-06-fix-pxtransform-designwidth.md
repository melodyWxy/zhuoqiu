---
date: 2026-05-14
version: v2.20.x
title: 修 weapp px → rpx 倍率丢失（pxtransform designWidth）
---

# 修 weapp px → rpx 倍率丢失（pxtransform designWidth）

## 动机

用户反馈：H5 显示正常，**只有微信小程序里所有文字、卡片显得明显偏小**（"砍半"），加 +2px 字号微调几乎无感。

排查结果：

- 项目顶层 `designWidth: 375`（`config/index.js` 与 `taro.config.ts`），按 Taro 约定 px → rpx 应该 **×2 倍率**：`font-size: 16px` → `32rpx`。
- 但实际产物里源码 `font-size: 16px` 被编译成 `font-size: 16rpx`（**1:1 平移**），证明 `postcss-pxtransform` 拿到的 designWidth 是默认 750，不是顶层配的 375。
- 1rpx 在 750-rpx 视宽下 ≈ 0.5px → `16rpx` 视觉只剩约 8pt，整页"显小"是必然结果。
- H5 端走的是另一条路（px → rem，Taro h5 自己注入 root font-size），不经过 pxtransform，所以 H5 没问题。

> 用户的判断完全准确："为什么小程序看起来这么小？是否使用了相对单位？是否单位不适配？" 是 —— weapp 的渲染单位是 rpx，px → rpx 转换的倍率丢了。

修了根因之后视觉就对了，无需再做字号 / padding / radius 的额外微调（先前试过的 +2px 微调已撤回）。

## PRD / 设计变化

无（属配置 bugfix）。

## 代码变化

- 新增文件：无
- 修改文件：
  - `billiards-score/config/index.js`
  - `billiards-score/taro.config.ts`

两份 config 的 `mini.postcss.pxtransform.config` 从 `{}` 改为：

```js
config: {
  designWidth: 375,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
    375: 2 / 1
  }
}
```

即使顶层 `designWidth` 已设 375，pxtransform 插件不一定继承，**必须在自己的 config 里显式声明**。`deviceRatio` 是 Taro 文档给的标准映射表。

- 删除文件：无

## 验证步骤

- [x] `npm run build:weapp:prod` 通过
- [x] `dist/common.wxss` 中源 `font-size: 16px` 编译为 `32rpx`（不是修前的 `16rpx`）
- [x] `dist/pages/nine-ball/index.wxss` 中源 `padding: 16px` 编译为 `32rpx`
- [ ] 微信开发者工具 + 真机预览：tabBar / 首页 / 我 / 球房 / 赛事详情 视觉与 H5 一致
- [ ] H5 端无回归（H5 不经过 pxtransform，不应有变化）

## 已知 trade-off / 遗留

- 配色 / 阴影 / 动效 / 组件风格 / 字号阶梯 token 化等深度 UI 重设计 → 后续 Pass B 单独起 `prd/c-client-ui-revamp.md`。
