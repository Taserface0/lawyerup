import { createContext, useContext, useEffect, useReducer } from 'react';
import { loadSession, saveSession, clearSession, seedDemoAccountIfMissing } from '../services/mockAuthStore.js';
import { seedDemoLawyerAccountIfMissing } from '../services/mockLawyerStore.js';

const initialState = {
  screen: 'home', // home | chat | lawyers | bookings | profile
  filterCat: 'all',
  user: null, // hydrated from localStorage on first load — see the lazy init below
  theme: 'light', // light | dark
  // Phase 2: consultation-type + resolved location, shared between the
  // Lawyers list screen and the lawyer-profile booking modal so a choice
  // made in one place carries into the other without re-asking.
  consultationType: 'online', // 'online' | 'in_person' — online is the safe default: it never touches location
  // null | { source:'gps'|'manual', city, lat?, lng? }. lat/lng are only
  // ever present when source is 'gps', live ONLY in this in-memory context
  // (never written to localStorage — see the persistence effect below,
  // which only ever mirrors `user`), and exist purely so THIS client's own
  // Lawyers list can sort by distance. The privacy boundary is enforced at
  // the write site, not here: mockAppointmentStore.js's createAppointment()
  // only accepts a `city` string, and BookingCheckoutModal.jsx only ever
  // reads `.city` off this object — the lat/lng never reaches anything
  // shared/durable (an Appointment/Case), so a lawyer can never see them.
  locationQuery: null,
  // Phase 3: which case's consultation screen is currently open (drill-down
  // navigation, not a bottom-nav tab — same pattern as filterCat driving
  // LawyersScreen).
  activeCaseId: null,
  // Which nav-tab screen navigated INTO the consultation (e.g. 'bookings',
  // 'messages', 'lawyerAppointments', 'lawyerClients') — lets BottomNav
  // keep the correct parent tab highlighted while screen==='consultation',
  // and lets ConsultationScreen's back button return to the true origin
  // instead of a hardcoded default. Deliberately a separate action from
  // SET_ACTIVE_CASE (not folded into its payload) so every existing
  // dispatch site's shape stays exactly as it was; each just gains one
  // extra dispatch call, consistent with how they already fire two in
  // sequence (SET_ACTIVE_CASE + SET_SCREEN). Not persisted to localStorage
  // — same as activeCaseId, this is intentionally session-only for now.
  activeCaseOrigin: null,
  // No seeded welcome message here — it's rendered from the translation
  // dictionary in ChatScreen instead, so it re-renders in the right
  // language and never gets sent to the API as fake conversation history.
  chatMessages: [],
  chatBusy: false,
  lang: 'en', // language CODE, not display label — see src/i18n/index.js
  modal: { type: null, payload: null },
  toast: { message: '', id: 0 },
};

// NOTE: appointments/bookings are no longer part of this in-memory reducer
// — they moved to services/mockAppointmentStore.js (localStorage-backed,
// readable by both the client and lawyer "sides" of the app). Screens read
// them directly (getAppointmentsForClient/getAppointmentsForLawyer) rather
// than through context, the same way AdminScreen already reads lawyer
// applications directly from mockLawyerStore.js. See BookingsScreen.jsx.

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.payload };
    case 'SET_FILTER_CAT':
      return { ...state, filterCat: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'LOGOUT':
      return { ...state, user: null };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_CONSULTATION_TYPE':
      return { ...state, consultationType: action.payload };
    case 'SET_LOCATION_QUERY':
      return { ...state, locationQuery: action.payload };
    case 'SET_ACTIVE_CASE':
      return { ...state, activeCaseId: action.payload };
    case 'SET_ACTIVE_CASE_ORIGIN':
      return { ...state, activeCaseOrigin: action.payload };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case 'SET_CHAT_BUSY':
      return { ...state, chatBusy: action.payload };
    case 'SET_LANG':
      return { ...state, lang: action.payload };
    case 'OPEN_MODAL':
      return { ...state, modal: action.payload };
    case 'CLOSE_MODAL':
      return { ...state, modal: { type: null, payload: null } };
    case 'SHOW_TOAST':
      return { ...state, toast: action.payload };
    default:
      return state;
  }
}

// Lazy init reads any previously-saved mock session exactly once, so a
// page refresh keeps the person signed in. See services/mockAuthStore.js —
// this reads only safe profile fields (name/phone/email/city), never a
// password.
//
// The restored screen must match the restored user's role: without this,
// a refreshed lawyer session would hydrate with the hardcoded client
// 'home' screen (a key that isn't even in the lawyer's nav), showing the
// client Home screen's content underneath the lawyer's dashboard nav bar
// with no tab highlighted. Defaulting a restored lawyer to their
// dashboard keeps the nav and the visible screen in sync from the very
// first render.
// Theme and language are per-device preferences, so they persist across
// reloads too (they used to reset to light/English on every refresh).
const PREFS_KEY = 'lawyerup_prefs';

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    return {
      theme: prefs.theme === 'dark' ? 'dark' : 'light',
      lang: ['en', 'hi', 'hinglish'].includes(prefs.lang) ? prefs.lang : 'en',
    };
  } catch {
    return {};
  }
}

function init() {
  const restoredUser = loadSession();
  const initialScreen = restoredUser?.role === 'lawyer' ? 'lawyerAppointments' : initialState.screen;
  return { ...initialState, ...loadPrefs(), user: restoredUser, screen: initialScreen };
}

const AppStateContext = createContext(null);
const AppDispatchContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, init);

  // Keep the document theme attribute (used by the dark-theme CSS block) in sync.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  // Screen readers and browser translation rely on <html lang>; it used to
  // stay "en" even while the whole UI was in Hindi.
  useEffect(() => {
    document.documentElement.setAttribute('lang', state.lang === 'hi' ? 'hi' : state.lang === 'hinglish' ? 'hi-Latn' : 'en');
  }, [state.lang]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: state.theme, lang: state.lang }));
    } catch {
      // storage unavailable (private mode) — preferences just won't persist
    }
  }, [state.theme, state.lang]);

  // Mirror the logged-in user to localStorage so it survives a refresh.
  // This is the ONLY thing persisted here — bookings, chat, etc. stay
  // in-memory and reset on reload, same as before.
  useEffect(() => {
    if (state.user) saveSession(state.user);
    else clearSession();
  }, [state.user]);

  // Make sure there's always a ready-made demo account to sign in with.
  useEffect(() => {
    seedDemoAccountIfMissing();
    // DEV-ONLY: also seed a demo lawyer account, so the lawyer side of the
    // appointment/case/chat flow is testable without hand-registering a
    // brand-new lawyer application first. import.meta.env.DEV is Vite's
    // built-in flag — this is false (and the call never happens) in a real
    // `vite build` production bundle. See the large comment on
    // seedDemoLawyerAccountIfMissing() in mockLawyerStore.js for exactly
    // why it's structured this way.
    if (import.meta.env.DEV) {
      seedDemoLawyerAccountIfMissing();
    }
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppProvider');
  return ctx;
}

export function useAppDispatch() {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) throw new Error('useAppDispatch must be used within an AppProvider');
  return ctx;
}
