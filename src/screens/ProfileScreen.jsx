import AuthGate from './profile/AuthGate.jsx';
import AccountView from './profile/AccountView.jsx';
import LawyerStatusView from './profile/LawyerStatusView.jsx';
import { useAppState } from '../context/AppContext.jsx';

export default function ProfileScreen() {
  const { user } = useAppState();

  let content;
  if (!user) content = <AuthGate />;
  else if (user.role === 'lawyer') content = <LawyerStatusView />;
  else content = <AccountView />;

  return <div className="screen active">{content}</div>;
}
