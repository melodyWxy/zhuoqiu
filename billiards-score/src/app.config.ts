export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/nine-ball/index',
    'pages/eight-ball/index',
    'pages/config/index',
    'pages/me/index',
    'pages/join/index',
    'pages/match-detail/index',
    'pages/venue-login/index',
    'pages/venue-apply/index',
    'pages/venues/index',
    'pages/venue-detail/index',
    'pages/tournaments/index',
    'pages/tournament-detail/index'
  ],
  window: {
    navigationBarTitleText: '击球帮',
    navigationBarBackgroundColor: '#1a2f23',
    navigationBarTextStyle: 'white',
    backgroundColor: '#0a0f0d'
  },
  tabBar: {
    color: '#a0a8a4',
    selectedColor: '#d4af37',
    backgroundColor: '#1a2f23',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tabs/home.png',
        selectedIconPath: 'assets/tabs/home-active.png'
      },
      {
        pagePath: 'pages/me/index',
        text: '我',
        iconPath: 'assets/tabs/me.png',
        selectedIconPath: 'assets/tabs/me-active.png'
      }
    ]
  }
})
