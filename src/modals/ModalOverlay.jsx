import { useAppState, useAppDispatch } from '../context/AppContext.jsx';
import LawyerProfileModal from './LawyerProfileModal.jsx';
import BookingCheckoutModal from './BookingCheckoutModal.jsx';
import BookingConfirmModal from './BookingConfirmModal.jsx';
import BookingDetailModal from './BookingDetailModal.jsx';
import WelcomeAuthModal from './WelcomeAuthModal.jsx';

export default function ModalOverlay() {
  const { modal } = useAppState();
  const dispatch = useAppDispatch();
  const active = !!modal.type;

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      dispatch({ type: 'CLOSE_MODAL' });
    }
  }

  function renderContent() {
    switch (modal.type) {
      case 'lawyerProfile':
        return <LawyerProfileModal key={modal.payload.lawyerId} lawyerId={modal.payload.lawyerId} />;
      case 'booking':
        return (
          <BookingCheckoutModal
            key={modal.payload.slotId}
            lawyerId={modal.payload.lawyerId}
            slotId={modal.payload.slotId}
            slotLabel={modal.payload.slotLabel}
            consultationType={modal.payload.consultationType}
            city={modal.payload.city}
          />
        );
      case 'bookingConfirm':
        return (
          <BookingConfirmModal
            lawyerName={modal.payload.lawyerName}
            date={modal.payload.date}
            slot={modal.payload.slot}
            caseId={modal.payload.caseId}
          />
        );
      case 'bookingDetail':
        return <BookingDetailModal key={modal.payload.appointmentId} appointmentId={modal.payload.appointmentId} />;
      case 'welcomeAuth':
        return <WelcomeAuthModal />;
      default:
        return null;
    }
  }

  return (
    <div className={`modal-overlay ${active ? 'active' : ''}`} onClick={handleOverlayClick}>
      <div className="modal-sheet">{renderContent()}</div>
    </div>
  );
}
