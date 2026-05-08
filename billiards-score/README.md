# 桌球计分 App

简单到拿起手机就会用的桌球计分工具。

## 功能特性

### 九球追分
- 支持2人/3人追分赛
- 进球不需点击，系统自动轮换
- 只在犯规和9号球进袋时操作
- 普胜/小金/大金自动计算得分

### 中式八球
- 抢几局，记胜负
- 简洁的操作界面

## 技术栈

- Taro 4.x（跨平台框架）
- React 18
- TypeScript
- Zustand（状态管理）
- SCSS

## 开发

```bash
# 安装依赖
npm install

# 微信小程序开发
npm run dev:weapp

# H5 开发
npm run dev:h5

# 构建微信小程序
npm run build:weapp

# 构建 H5
npm run build:h5
```

## 项目结构

```
src/
├── core/                 # 核心逻辑
│   ├── game/             # 游戏引擎
│   │   ├── NineBall.ts   # 九球追分逻辑
│   │   └── store.ts      # 状态管理
│   ├── types/            # 类型定义
│   └── constants/        # 常量配置
├── pages/                # 页面
│   ├── index/            # 首页
│   ├── nine-ball/        # 九球追分
│   ├── eight-ball/       # 中式八球
│   ├── config/           # 赛前配置
│   └── history/           # 历史记录
└── styles/               # 全局样式
```

## License

MIT
