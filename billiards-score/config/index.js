module.exports = {
  projectName: 'billiards-score',
  date: '2026-05-08',
  designWidth: 375,
  deviceRatio: {
    375: 1,
    812: 1,
    414: 1
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [
    ['@tarojs/plugin-platform-weapp'],
    ['@tarojs/plugin-platform-h5'],
    ['@tarojs/plugin-framework-react']
  ],
  defineConstants: {
    // 编译时注入；生产 build 用（推荐方式：拆 API 域名）：
    //   TARO_APP_API_BASE=https://billiards-server.macrobit.com.cn/v1 \
    //   TARO_APP_WS_BASE=wss://billiards-server.macrobit.com.cn/ws \
    //   npm run build:h5
    // 留空时回落到 src/core/api/config.ts 的 resolveBase()（同源 / dev 推断）
    'process.env.TARO_APP_API_BASE': JSON.stringify(
      process.env.TARO_APP_API_BASE || ''
    ),
    'process.env.TARO_APP_WS_BASE': JSON.stringify(
      process.env.TARO_APP_WS_BASE || ''
    )
  },
  copy: {
    patterns: [],
    options: {}
  },
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: true
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {
          // 强制按顶层 designWidth=375 计算 px → rpx 倍率（×2）。
          // 不写的话 postcss-pxtransform 默认用 750，结果 1:1 直接平移
          // → 所有 px 都被压成原 rpx 数值（视觉砍半）。这是 weapp "整页显小" 的根因。
          designWidth: 375,
          deviceRatio: {
            640: 2.34 / 2,
            750: 1,
            828: 1.81 / 2,
            375: 2 / 1
          }
        }
      },
      url: {
        enable: true,
        config: {
          limit: 1024
        }
      },
      cssModules: {
        enable: false,
        config: {}
      }
    }
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: {
        enable: true,
        config: {}
      },
      cssModules: {
        enable: false,
        config: {}
      }
    },
    devServer: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: 'all',
      https: false
    }
  }
}
