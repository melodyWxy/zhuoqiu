import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MatchesList from './pages/Matches/List'
import MatchDetail from './pages/Matches/Detail'
import UsersList from './pages/Users/List'
import UserDetailPage from './pages/Users/Detail'
import Audit from './pages/Audit'
import Settings from './pages/Settings'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'matches', element: <MatchesList /> },
      { path: 'matches/:id', element: <MatchDetail /> },
      { path: 'users', element: <UsersList /> },
      { path: 'users/:id', element: <UserDetailPage /> },
      { path: 'audit', element: <Audit /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
])
