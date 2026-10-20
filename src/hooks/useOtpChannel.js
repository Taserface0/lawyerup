import { useCallback, useEffect, useRef, useState } from 'react';

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Drives the send → wait → verify → resend lifecycle for one OTP channel
 * (mobile or email). Both verification steps in RegisterFlow use their own
 * instance of this hook, pointed at the mobile or email mock service.
 *
 * status: 'idle' | 'sending' | 'sent' | 'verifying' | 'verified' | 'error'
 * errorKey: translation key suffix ('wrongCode' | 'expiredCode' | null)
 */
export function useOtpChannel({ sendFn, verifyFn }) {
  const [status, setStatus] = useState('idle');
  const [errorKey, setErrorKey] = useState(null);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const startCooldown = useCallback(() => {
    setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  async function send(destination) {
    setStatus('sending');
    setErrorKey(null);
    try {
      await sendFn(destination);
      setStatus('sent');
      startCooldown();
    } catch {
      setStatus('error');
      setErrorKey('sendFailed');
    }
  }

  async function verify(destination, code) {
    setStatus('verifying');
    setErrorKey(null);
    try {
      const ok = await verifyFn(destination, code);
      if (ok) {
        setStatus('verified');
        return true;
      }
      setStatus('sent');
      setErrorKey('wrongCode');
      return false;
    } catch (err) {
      setStatus('sent');
      setErrorKey(err.message === 'expired' ? 'expiredCode' : 'wrongCode');
      return false;
    }
  }

  return {
    status,
    errorKey,
    resendSecondsLeft,
    canResend: resendSecondsLeft === 0 && status !== 'sending' && status !== 'verifying',
    send,
    verify,
  };
}
