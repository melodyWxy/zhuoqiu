import type { UserConfigExport } from '@tarojs/cli'

const config: UserConfigExport = {
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
  defineConstants: {},
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
      https: false
    }
  },
  alias: {
    '@': '/src',
    '@/core': '/src/core',
    '@/components': '/src/components',
    '@/pages': '/src/pages'
  }
}

export default config
