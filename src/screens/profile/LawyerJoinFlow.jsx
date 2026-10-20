import { useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import PracticeAreaPicker from '../../components/PracticeAreaPicker.jsx';
import DocumentUploadField from '../../components/DocumentUploadField.jsx';
import { useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';
import { isValidEmail, isValidMobile, isValidPassword } from '../../lib/utils.js';
import { isEmailAvailable, lawyerSignUp } from '../../services/authApi.js';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  city: '',
  password: '',
  confirmPassword: '',
  barCouncilId: '',
  barCouncilState: '',
  yearsOfExperience: '',
  consultationFee: '',
  courts: '',
  langs: '',
  bio: '',
};

export default function LawyerJoinFlow() {
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  const [step, setStep] = useState('form'); // form | documents | submitted
  const [form, setForm] = useState(EMPTY_FORM);
  const [practiceAreas, setPracticeAreas] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [documents, setDocuments] = useState({ barCertificate: null, idProof: null });
  const [createdProfile, setCreatedProfile] = useState(null);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validateForm() {
    const errors = {};
    if (!form.firstName.trim()) errors.firstName = t('register.errors.firstNameRequired');
    if (!form.lastName.trim()) errors.lastName = t('register.errors.lastNameRequired');
    if (!form.phone.trim()) errors.phone = t('register.errors.mobileRequired');
    else if (!isValidMobile(form.phone)) errors.phone = t('register.errors.mobileInvalid');
    if (!form.email.trim()) errors.email = t('register.errors.emailRequired');
    else if (!isValidEmail(form.email)) errors.email = t('register.errors.emailInvalid');
    if (!form.city.trim()) errors.city = t('register.errors.cityRequired');
    if (!isValidPassword(form.password)) errors.password = t('register.errors.passwordTooShort');
    else if (form.password !== form.confirmPassword) errors.confirmPassword = t('register.errors.passwordsMismatch');
    if (!form.barCouncilId.trim()) errors.barCouncilId = t('lawyerJoin.errors.barCouncilIdRequired');
    if (!form.barCouncilState.trim()) errors.barCouncilState = t('lawyerJoin.errors.barCouncilStateRequired');
    if (!form.yearsOfExperience || Number(form.yearsOfExperience) <= 0)
      errors.yearsOfExperience = t('lawyerJoin.errors.experienceRequired');
    if (!form.consultationFee || Number(form.consultationFee) <= 0)
      errors.consultationFee = t('lawyerJoin.errors.feeRequired');
    if (practiceAreas.length === 0) errors.practiceAreas = t('lawyerJoin.errors.practiceAreasRequired');
    return errors;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // Checked on the server before the documents step; submitting checks again.
    try {
      if (!(await isEmailAvailable(form.email))) {
        setFieldErrors({ email: t('toast.emailInUse') });
        return;
      }
    } catch {
      showToast(t('toast.serverUnavailable'));
      return;
    }
    setStep('documents');
  }

  async function handleSubmitApplication() {
    try {
      const profile = await lawyerSignUp({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        password: form.password,
        barCouncilId: form.barCouncilId.trim(),
        barCouncilState: form.barCouncilState.trim(),
        yearsOfExperience: Number(form.yearsOfExperience),
        practiceAreas,
        consultationFee: Number(form.consultationFee),
        courts: form.courts
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        langs: form.langs.trim() || 'English',
        bio: form.bio.trim() || t('lawyerJoin.defaultBio', { years: form.yearsOfExperience }),
        documents,
      });
      setCreatedProfile(profile);
      setStep('submitted');
      showToast(t('toast.applicationSubmitted'));
    } catch (err) {
      if (err.message === 'email-in-use') {
        setFieldErrors({ email: t('toast.emailInUse') });
        setStep('form');
      } else showToast(t('toast.serverUnavailable'));
    }
  }

  function handleViewStatus() {
    dispatch({ type: 'SET_USER', payload: createdProfile });
    dispatch({ type: 'SET_SCREEN', payload: 'lawyerVerification' });
  }

  const bothDocsUploaded = documents.barCertificate && documents.idProof;

  // --- Step: form ---------------------------------------------------------
  if (step === 'form') {
    return (
      <>
        <div className="auth-intro">
          <h2>{t('lawyerJoin.formTitle')}</h2>
          <p>{t('lawyerJoin.formSubtitle')}</p>
        </div>

        <form onSubmit={handleFormSubmit}>
          <label className="field-label">{t('register.firstNameLabel')}</label>
          <input className="field-input" type="text" placeholder={t('register.firstNamePlaceholder')} value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
          {fieldErrors.firstName && <p className="field-error">{fieldErrors.firstName}</p>}

          <label className="field-label">{t('register.lastNameLabel')}</label>
          <input className="field-input" type="text" placeholder={t('register.lastNamePlaceholder')} value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
          {fieldErrors.lastName && <p className="field-error">{fieldErrors.lastName}</p>}

          <label className="field-label">{t('register.mobileLabel')}</label>
          <input className="field-input" type="tel" maxLength={10} placeholder={t('register.mobilePlaceholder')} value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
          {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}

          <label className="field-label">{t('register.emailLabel')}</label>
          <input className="field-input" type="email" placeholder={t('register.emailPlaceholder')} value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}

          <label className="field-label">{t('register.cityLabel')}</label>
          <input className="field-input" type="text" placeholder={t('register.cityPlaceholder')} value={form.city} onChange={(e) => updateField('city', e.target.value)} />
          {fieldErrors.city && <p className="field-error">{fieldErrors.city}</p>}

          <label className="field-label">{t('register.passwordLabel')}</label>
          <input className="field-input" type="password" placeholder={t('register.passwordPlaceholder')} value={form.password} onChange={(e) => updateField('password', e.target.value)} />
          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}

          <label className="field-label">{t('register.confirmPasswordLabel')}</label>
          <input className="field-input" type="password" placeholder={t('register.confirmPasswordPlaceholder')} value={form.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} />
          {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}

          <div className="section-label tight">{t('lawyerJoin.barDetailsHeading')}</div>

          <label className="field-label">{t('lawyerJoin.barCouncilIdLabel')}</label>
          <input className="field-input" type="text" placeholder={t('lawyerJoin.barCouncilIdPlaceholder')} value={form.barCouncilId} onChange={(e) => updateField('barCouncilId', e.target.value)} />
          {fieldErrors.barCouncilId && <p className="field-error">{fieldErrors.barCouncilId}</p>}

          <label className="field-label">{t('lawyerJoin.barCouncilStateLabel')}</label>
          <input className="field-input" type="text" placeholder={t('lawyerJoin.barCouncilStatePlaceholder')} value={form.barCouncilState} onChange={(e) => updateField('barCouncilState', e.target.value)} />
          {fieldErrors.barCouncilState && <p className="field-error">{fieldErrors.barCouncilState}</p>}

          <label className="field-label">{t('lawyerJoin.experienceLabel')}</label>
          <input className="field-input" type="number" min="0" placeholder={t('lawyerJoin.experiencePlaceholder')} value={form.yearsOfExperience} onChange={(e) => updateField('yearsOfExperience', e.target.value)} />
          {fieldErrors.yearsOfExperience && <p className="field-error">{fieldErrors.yearsOfExperience}</p>}

          <label className="field-label">{t('lawyerJoin.feeLabel')}</label>
          <input className="field-input" type="number" min="0" placeholder={t('lawyerJoin.feePlaceholder')} value={form.consultationFee} onChange={(e) => updateField('consultationFee', e.target.value)} />
          {fieldErrors.consultationFee && <p className="field-error">{fieldErrors.consultationFee}</p>}

          <label className="field-label">{t('lawyerJoin.practiceAreasLabel')}</label>
          <PracticeAreaPicker value={practiceAreas} onChange={setPracticeAreas} />
          {fieldErrors.practiceAreas && <p className="field-error">{fieldErrors.practiceAreas}</p>}

          <label className="field-label">{t('lawyerJoin.courtsLabel')}</label>
          <input className="field-input" type="text" placeholder={t('lawyerJoin.courtsPlaceholder')} value={form.courts} onChange={(e) => updateField('courts', e.target.value)} />

          <label className="field-label">{t('lawyerJoin.languagesLabel')}</label>
          <input className="field-input" type="text" placeholder={t('lawyerJoin.languagesPlaceholder')} value={form.langs} onChange={(e) => updateField('langs', e.target.value)} />

          <label className="field-label">{t('lawyerJoin.bioLabel')}</label>
          <textarea
            className="field-input"
            style={{ minHeight: 70, resize: 'none', fontFamily: 'inherit' }}
            placeholder={t('lawyerJoin.bioPlaceholder')}
            value={form.bio}
            onChange={(e) => updateField('bio', e.target.value)}
          />

          <button className="book-btn" type="submit" style={{ marginTop: 8 }}>
            {t('lawyerJoin.continueToDocsButton')}
          </button>
        </form>
      </>
    );
  }

  // --- Step: documents ------------------------------------------------------
  if (step === 'documents') {
    return (
      <>
        <div className="auth-intro">
          <h2>{t('lawyerJoin.docsHeading')}</h2>
          <p>{t('lawyerJoin.docsSubheading')}</p>
        </div>

        <div className="disclaimer" style={{ marginBottom: 16 }}>
          <Icon name="info" />
          <span>{t('lawyerJoin.docsMockNotice')}</span>
        </div>

        <DocumentUploadField
          label={t('lawyerJoin.docBarCertificate')}
          fileName={documents.barCertificate}
          onFileSelected={(name) => setDocuments((d) => ({ ...d, barCertificate: name }))}
        />
        <DocumentUploadField
          label={t('lawyerJoin.docIdProof')}
          fileName={documents.idProof}
          onFileSelected={(name) => setDocuments((d) => ({ ...d, idProof: name }))}
        />

        <button className="book-btn" disabled={!bothDocsUploaded} onClick={handleSubmitApplication} style={{ marginTop: 10 }}>
          {t('lawyerJoin.submitApplicationButton')}
        </button>
        <button
          type="button"
          className="link-btn"
          style={{ display: 'block', margin: '14px auto 0' }}
          onClick={() => setStep('form')}
        >
          {t('lawyerJoin.backToForm')}
        </button>
      </>
    );
  }

  // --- Step: submitted ------------------------------------------------------
  return (
    <>
      <div className="status-badge-lg review">
        <div className="ring">
          <Icon name="receipt" />
        </div>
        <h2 className="display" style={{ fontSize: 17, margin: 0 }}>
          {t('lawyerJoin.submittedTitle')}
        </h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>{t('lawyerJoin.submittedSubtitle')}</p>
      </div>
      <button className="book-btn" onClick={handleViewStatus}>
        {t('lawyerJoin.viewStatusButton')}
      </button>
    </>
  );
}
