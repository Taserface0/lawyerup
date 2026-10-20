import { useEffect, useState } from 'react';
import { useAppState } from '../context/AppContext.jsx';

export default function Toast() {
  const { toast } = useAppState();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast.message) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return <div className={`toast ${visible ? 'show' : ''}`}>{toast.message}</div>;
}
