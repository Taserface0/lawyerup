import { useRef } from 'react';
import Icon from '../icons/Icon.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

/**
 * MOCK ONLY. Uses a real <input type="file"> so picking a file feels
 * authentic, but only ever reads file.name for display — the file's
 * contents are never read, uploaded, or stored anywhere. There is no
 * backend to receive it yet; a real implementation would upload to
 * S3/GCS (or similar) via a signed URL issued by the backend, never
 * directly from the frontend to a bucket with embedded credentials.
 *
 * @param {string} label
 * @param {string|null} fileName - currently "uploaded" filename, if any
 * @param {(fileName: string) => void} onFileSelected
 */
export default function DocumentUploadField({ label, fileName, onFileSelected }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);

  function handleChange(e) {
    const file = e.target.files && e.target.files[0];
    if (file) onFileSelected(file.name);
  }

  return (
    <div className="doc-upload-row">
      <div className="doc-upload-left">
        <Icon name="receipt" />
        <div className="doc-upload-text">
          <b>{label}</b>
          <span className="doc-upload-name">{fileName || t('lawyerJoin.noFileChosen')}</span>
        </div>
      </div>
      <button type="button" className={`doc-upload-btn ${fileName ? 'done' : ''}`} onClick={() => inputRef.current?.click()}>
        {fileName ? t('lawyerJoin.replaceFile') : t('lawyerJoin.chooseFile')}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden-file-input"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleChange}
      />
    </div>
  );
}
