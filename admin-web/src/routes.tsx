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
import FeedbackList from './pages/Feedback/List'
import VenueApplications from './pages/Venues/Applications'
import VenueApplicationDetail from './pages/Venues/ApplicationDetail'
import VenueLogin from './pages/VenueMerchant/VenueLogin'
import Apply from './pages/VenueMerchant/Apply'
import ApplyStatus from './pages/VenueMerchant/ApplyStatus'
import VenueOverview from './pages/VenueMerchant/Overview'
import VenueProfile from './pages/VenueMerchant/Profile'
import TournamentsList from './pages/VenueMerchant/TournamentsList'
import TournamentForm from './pages/VenueMerchant/TournamentForm'
import TournamentDetail from './pages/VenueMerchant/TournamentDetail'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/venue-login', element: <VenueLogin /> },
  { path: '/apply', element: <Apply /> },
  { path: '/apply/status', element: <ApplyStatus /> },
  { path: '/venue/overview', element: <VenueOverview /> },
  { path: '/venue/profile', element: <VenueProfile /> },
  { path: '/venue/tournaments', element: <TournamentsList /> },
  { path: '/venue/tournaments/new', element: <TournamentForm /> },
  { path: '/venue/tournaments/:id', element: <TournamentDetail /> },
  { path: '/venue/tournaments/:id/edit', element: <TournamentForm /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'matches', element: <MatchesList /> },
      { path: 'matches/:id', element: <MatchDetail /> },
      { path: 'users', element: <UsersList /> },
      { path: 'users/:id', element: <UserDetailPage /> },
      { path: 'venue-applications', element: <VenueApplications /> },
      { path: 'venue-applications/:id', element: <VenueApplicationDetail /> },
      { path: 'feedback', element: <FeedbackList /> },
      { path: 'audit', element: <Audit /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
])
