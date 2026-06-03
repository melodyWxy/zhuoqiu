import { Component, PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import './styles/global.scss'

/**
 * App 根组件。
 *
 * v2.22 战报系统：onLaunch 解析小程序码 scene，扫码进战报页：
 *   scene = `m=${matchIdSuffix}` → navigateTo /pages/match-detail/index?ms=...
 *   match-detail 拿 ms 后调 byIdSuffix 反查完整 matchId
 */
class App extends Component<PropsWithChildren> {
  onLaunch(options?: {
    scene?: number
    query?: Record<string, string | undefined>
    path?: string
  }) {
    const sceneCode = options?.scene
    const sceneStr = options?.query?.scene
    // scene === 1011：扫描小程序码（普通二维码 1047；这里二者都接，宽松匹配）
    const isFromQR = sceneCode === 1011 || sceneCode === 1047 || sceneCode === 1048
    if (isFromQR && sceneStr && sceneStr.startsWith('m=')) {
      const ms = sceneStr.slice(2)
      // reLaunch 替代 navigateTo：避免 tabBar / 路由栈冲突
      Taro.reLaunch({
        url: `/pages/match-detail/index?ms=${encodeURIComponent(ms)}`
      }).catch(() => {
        // 扫码进入异常时落首页
      })
    }
  }

  componentDidShow() {
    // noop
  }

  componentDidHide() {
    // noop
  }

  render() {
    return this.props.children
  }
}

export default App
