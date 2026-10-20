import { AppProvider, useAppState } from './context/AppContext.jsx';
import TopBar from './components/TopBar.jsx';
import BottomNav from './components/BottomNav.jsx';
import Toast from './components/Toast.jsx';
import ModalOverlay from './modals/ModalOverlay.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import ChatScreen from './screens/ChatScreen.jsx';
import LawyersScreen from './screens/LawyersScreen.jsx';
import BookingsScreen from './screens/BookingsScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import ConsultationScreen from './screens/ConsultationScreen.jsx';
import MessagesScreen from './screens/MessagesScreen.jsx';
import LawyerAppointmentsScreen from './screens/lawyer/LawyerAppointmentsScreen.jsx';
import LawyerClientsScreen from './screens/lawyer/LawyerClientsScreen.jsx';
import LawyerVerificationScreen from './screens/lawyer/LawyerVerificationScreen.jsx';
import LawyerProfileScreen from './screens/lawyer/LawyerProfileScreen.jsx';
import LawyerSettingsScreen from './screens/lawyer/LawyerSettingsScreen.jsx';
import LawyerAvailabilityScreen from './screens/lawyer/LawyerAvailabilityScreen.jsx';
import LegalScreen from './screens/LegalScreen.jsx';
import { ADMIN_ENABLED } from './lib/featureFlags.js';

const SCREENS = {
  home: HomeScreen,
  chat: ChatScreen,
  lawyers: LawyersScreen,
  bookings: BookingsScreen,
  messages: MessagesScreen,
  profile: ProfileScreen,
  // The mock admin console has no authentication, so it only exists in dev
  // builds (or when VITE_ENABLE_MOCK_ADMIN=true for a private demo).
  ...(ADMIN_ENABLED ? { admin: AdminScreen } : {}),
  legal: LegalScreen, // privacy notice, terms and AI disclaimer
  consultation: ConsultationScreen, // not in bottom nav — reached by drilling into an appointment/case
  lawyerAppointments: LawyerAppointmentsScreen,
  lawyerClients: LawyerClientsScreen,
  lawyerVerification: LawyerVerificationScreen,
  lawyerProfile: LawyerProfileScreen,
  lawyerSettings: LawyerSettingsScreen,
  lawyerAvailability: LawyerAvailabilityScreen, // not in bottom nav — reached via a link on the lawyer's Profile tab
};

function AppShell() {
  const { screen, user } = useAppState();
  // Belt-and-suspenders: if `screen` is ever an unregistered/stale key for
  // a signed-in lawyer, fall back to their own dashboard rather than the
  // client Home screen — the same class of bug just fixed in AppContext's
  // hydration (see the comment on init()), guarded here too in case any
  // future code path leaves `screen` out of sync with `user.role`.
  const fallbackScreen = user?.role === 'lawyer' ? LawyerAppointmentsScreen : HomeScreen;
  const ActiveScreen = SCREENS[screen] || fallbackScreen;

  return (
    <div id="app">
      <TopBar />
      <ActiveScreen />
      <BottomNav />
      <Toast />
      <ModalOverlay />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
