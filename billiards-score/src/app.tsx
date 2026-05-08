import { Component, PropsWithChildren } from 'react'
import './styles/global.scss'

class App extends Component<PropsWithChildren> {
  componentDidShow() {
    console.log('App onShow')
  }

  componentDidHide() {
    console.log('App onHide')
  }

  render() {
    return this.props.children
  }
}

export default App
