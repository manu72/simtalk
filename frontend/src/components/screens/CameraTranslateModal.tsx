import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ImageTranslateResponse } from '@simtalk/shared-types';

import {
  CameraTranslateClientError,
  requestImageTranslate
} from '../../cameraTranslateClient';
import { AccessDeniedError } from '../../accessGate';
import { STIcon } from '../brand/Icons';
import { LangCard, LanguagePickerSheet } from '../brand/LanguagePicker';
import { LANGUAGES, type Language } from '../brand/languages';
import { FONT_BODY, FONT_DISPLAY, ST, STButton } from '../brand/primitives';
import { compressImage, CompressImageError } from './cameraTranslate/compressImage';

type CameraTranslateModalProps = {
  readonly open: boolean;
  readonly initialTarget: Language;
  readonly onClose: () => void;
  readonly onAccessDenied?: (retry: () => void) => void;
};

type Step = 'picking' | 'compressing' | 'previewing' | 'loading' | 'result' | 'error';

const MAX_IMAGE_BYTES_HINT = '6 MB';

const isLanguageWithBcp47 = (lang: Language): boolean => !!lang.bcp47;

const findInitialTarget = (initial: Language): Language => {
  if (isLanguageWithBcp47(initial)) return initial;
  const english = LANGUAGES.find((l) => l.bcp47 === 'en');
  return english ?? LANGUAGES[0]!;
};

export const CameraTranslateModal = ({
  open,
  initialTarget,
  onClose,
  onAccessDenied
}: CameraTranslateModalProps) => {
  const [target, setTarget] = useState<Language>(() => findInitialTarget(initialTarget));
  const [picker, setPicker] = useState(false);
  const [step, setStep] = useState<Step>('picking');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedFilename, setCompressedFilename] = useState<string>('image.jpg');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [result, setResult] = useState<ImageTranslateResponse | null>(null);
  const [originalOpen, setOriginalOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // Monotonic token used to invalidate in-flight file selections. compressImage
  // has no AbortSignal hook, so the only way to ignore a stale resolution is to
  // bump this counter on every code path that resets the picker (close, retake,
  // unmount) and refuse to apply results whose token no longer matches.
  const selectionRef = useRef(0);

  const resetState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    selectionRef.current++;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setCompressedBlob(null);
    setCompressedFilename('image.jpg');
    setErrorMessage('');
    setResult(null);
    setOriginalOpen(false);
    setStep('picking');
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    setTarget(findInitialTarget(initialTarget));
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open, initialTarget, resetState]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      selectionRef.current++;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  const handleFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    const token = ++selectionRef.current;
    setErrorMessage('');
    setResult(null);
    setOriginalOpen(false);
    setStep('compressing');
    try {
      const compressed = await compressImage(file);
      if (selectionRef.current !== token) {
        // The picker was reset (close/retake/unmount) or a newer file was
        // selected while compressImage was running. Drop this result instead
        // of overwriting the current state with a stale image. The blob will
        // be garbage-collected once this closure exits — we have not yet
        // allocated an object URL for it.
        return;
      }
      const filenameBase = file.name.replace(/\.[^.]+$/, '') || 'image';
      const safeName = `${filenameBase}.jpg`;
      const url = URL.createObjectURL(compressed.blob);
      if (selectionRef.current !== token) {
        // The reset happened between the token check above and createObjectURL.
        // Revoke the URL we just allocated so it does not leak, and bail.
        URL.revokeObjectURL(url);
        return;
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setCompressedBlob(compressed.blob);
      setCompressedFilename(safeName);
      setStep('previewing');
    } catch (error) {
      if (selectionRef.current !== token) return;
      const message =
        error instanceof CompressImageError
          ? error.message
          : 'Could not read that image. Try another one.';
      setErrorMessage(message);
      setStep('error');
    }
  }, []);

  const performTranslate = useCallback(async () => {
    if (!compressedBlob) return;
    setErrorMessage('');
    setResult(null);
    setStep('loading');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await requestImageTranslate(
        {
          image: compressedBlob,
          imageFilename: compressedFilename,
          targetLanguage: target.bcp47
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) {
        // The user pressed Cancel after the response had already arrived but
        // before React committed it. Drop the result and roll back to the
        // preview, matching the in-flight cancel branch in the catch block.
        setStep('previewing');
        return;
      }
      setResult(response);
      setStep('result');
    } catch (error) {
      if (controller.signal.aborted) {
        setStep('previewing');
        return;
      }
      if (error instanceof AccessDeniedError) {
        if (onAccessDenied) {
          // Roll the modal back to the preview so the user is not stuck on
          // "Translating..." behind the access gate. If the user submits the
          // password the queued retry calls performTranslate again, which
          // re-enters the loading step. If the user dismisses the gate they
          // remain on the preview and can retake, change target, or retry.
          setStep('previewing');
          onAccessDenied(() => void performTranslate());
        } else {
          setErrorMessage('Access denied. Re-enter the access password and try again.');
          setStep('error');
        }
        return;
      }
      const message =
        error instanceof CameraTranslateClientError
          ? error.message
          : 'Image translation failed. Please try again.';
      setErrorMessage(message);
      setStep('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [compressedBlob, compressedFilename, target.bcp47, onAccessDenied]);

  const handleCancelLoading = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRetake = useCallback(() => {
    selectionRef.current++;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setCompressedBlob(null);
    setStep('picking');
  }, []);

  const detectedSourceLabel = useMemo(() => {
    if (!result?.sourceLanguage) return null;
    const match = LANGUAGES.find((lang) => lang.bcp47 === result.sourceLanguage);
    if (match) return `${match.flag} ${match.name}`;
    return result.sourceLanguage;
  }, [result]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Translate image"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(6,10,46,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: ST.white,
          border: `3px solid ${ST.navy}`,
          borderRadius: 28,
          padding: 18,
          boxShadow: `0 10px 0 0 ${ST.navy}`,
          width: '100%',
          maxWidth: 520,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          color: ST.navy,
          overflow: 'hidden'
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 22,
              letterSpacing: '0.03em',
              textTransform: 'uppercase'
            }}
          >
            Translate image
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close translate image"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: `2px solid ${ST.navy}`,
              background: ST.white,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 3px 0 0 ${ST.navy}`
            }}
          >
            <STIcon name="x" size={16} color={ST.navy} />
          </button>
        </header>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 2 }}>
          <section aria-label="Target language">
            <LangCard
              label="Translate into"
              lang={target}
              onPick={() => setPicker(true)}
              disabled={step === 'loading'}
            />
          </section>

          {step === 'picking' || step === 'compressing' ? (
            <section aria-label="Choose image source" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  fontWeight: 600,
                  color: ST.navy,
                  opacity: 0.8
                }}
              >
                Capture a photo or upload an image. We detect the source language automatically. Images
                up to {MAX_IMAGE_BYTES_HINT} are supported.
              </p>
              <CapturePicker
                disabled={step === 'compressing'}
                onSelect={(file) => void handleFileSelected(file)}
              />
              {step === 'compressing' ? (
                <p
                  aria-live="polite"
                  style={{
                    margin: 0,
                    fontFamily: FONT_BODY,
                    fontSize: 12,
                    fontWeight: 600,
                    color: ST.navy,
                    opacity: 0.7,
                    textAlign: 'center'
                  }}
                >
                  Preparing image…
                </p>
              ) : null}
            </section>
          ) : null}

          {step === 'previewing' && previewUrl ? (
            <section aria-label="Image preview" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <PreviewImage src={previewUrl} />
              <div style={{ display: 'flex', gap: 10 }}>
                <STButton variant="dark" size="md" icon="rotate" onClick={handleRetake}>
                  Retake
                </STButton>
                <STButton
                  variant="primary"
                  size="md"
                  icon="spark"
                  full
                  onClick={() => void performTranslate()}
                >
                  Translate
                </STButton>
              </div>
            </section>
          ) : null}

          {step === 'loading' ? (
            <section
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                alignItems: 'center',
                padding: '20px 0'
              }}
            >
              {previewUrl ? <PreviewImage src={previewUrl} dimmed /> : null}
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 18,
                  letterSpacing: '0.04em',
                  color: ST.navy
                }}
              >
                Translating…
              </div>
              <STButton variant="ghost" size="sm" onClick={handleCancelLoading} icon="x">
                Cancel
              </STButton>
            </section>
          ) : null}

          {step === 'result' && result ? (
            <section
              aria-label="Translation result"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div
                style={{
                  background: ST.cyan,
                  border: `3px solid ${ST.navy}`,
                  borderRadius: 22,
                  boxShadow: `0 6px 0 0 ${ST.navy}`,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontSize: 12,
                      letterSpacing: '0.10em',
                      color: ST.navy,
                      textTransform: 'uppercase'
                    }}
                  >
                    {detectedSourceLabel ? `From ${detectedSourceLabel}` : 'Translated'}
                    {' → '}
                    {target.flag} {target.name}
                  </span>
                  <button
                    type="button"
                    aria-label="Copy translation"
                    onClick={() => {
                      void navigator.clipboard?.writeText(result.translatedText);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      border: `2px solid ${ST.navy}`,
                      background: ST.white,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <STIcon name="copy" size={14} color={ST.navy} />
                  </button>
                </div>
                {result.translatedText.trim().length === 0 ? (
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 16,
                      fontWeight: 600,
                      color: ST.navy,
                      opacity: 0.75
                    }}
                  >
                    {result.originalText.trim().length === 0
                      ? 'No readable text was found in this image.'
                      : "We couldn't translate this image. The extracted text is shown below."}
                  </div>
                ) : (
                  <div
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 20,
                      fontWeight: 600,
                      lineHeight: 1.4,
                      color: ST.navy,
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {result.translatedText}
                  </div>
                )}
              </div>

              {result.originalText.trim().length > 0 ? (
                <details
                  open={originalOpen}
                  onToggle={(event) => setOriginalOpen((event.target as HTMLDetailsElement).open)}
                  style={{
                    background: 'rgba(11,17,73,0.04)',
                    border: `2px solid ${ST.navy}`,
                    borderRadius: 18,
                    padding: '10px 14px'
                  }}
                >
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontFamily: FONT_DISPLAY,
                      fontSize: 13,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: ST.navy,
                      listStyle: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <STIcon
                      name={originalOpen ? 'caret-down' : 'caret-right'}
                      size={14}
                      color={ST.navy}
                    />
                    Original text
                  </summary>
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: FONT_BODY,
                      fontSize: 14,
                      lineHeight: 1.45,
                      color: ST.navy,
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {result.originalText}
                  </div>
                </details>
              ) : null}

              <div style={{ display: 'flex', gap: 10 }}>
                <STButton variant="dark" size="md" onClick={handleRetake} icon="camera">
                  New image
                </STButton>
                <STButton variant="secondary" size="md" full onClick={onClose} icon="check">
                  Done
                </STButton>
              </div>
            </section>
          ) : null}

          {step === 'error' ? (
            <section
              role="alert"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div
                style={{
                  background: ST.dangerSoft,
                  border: `2px solid ${ST.danger}`,
                  color: ST.navy,
                  padding: '12px 14px',
                  borderRadius: 14,
                  fontFamily: FONT_BODY,
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                {errorMessage || 'Something went wrong. Please try again.'}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <STButton variant="dark" size="md" onClick={handleRetake} icon="camera">
                  Pick another
                </STButton>
                {compressedBlob ? (
                  <STButton
                    variant="primary"
                    size="md"
                    full
                    icon="rotate"
                    onClick={() => void performTranslate()}
                  >
                    Retry
                  </STButton>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <LanguagePickerSheet
        open={picker}
        value={target}
        onPick={(lang) => {
          setTarget(lang);
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
        title="TRANSLATE INTO"
      />
    </div>
  );
};

type CapturePickerProps = {
  readonly disabled: boolean;
  readonly onSelect: (file: File | null) => void;
};

const CapturePicker = ({ disabled, onSelect }: CapturePickerProps) => {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          onSelect(file);
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          onSelect(file);
        }}
      />
      <STButton
        variant="primary"
        size="lg"
        full
        icon="camera"
        disabled={disabled}
        onClick={() => cameraInputRef.current?.click()}
      >
        Take photo
      </STButton>
      <STButton
        variant="secondary"
        size="md"
        full
        icon="upload"
        disabled={disabled}
        onClick={() => uploadInputRef.current?.click()}
      >
        Upload image
      </STButton>
    </div>
  );
};

type PreviewImageProps = {
  readonly src: string;
  readonly dimmed?: boolean;
};

const PreviewImage = ({ src, dimmed = false }: PreviewImageProps) => (
  <div
    style={{
      borderRadius: 22,
      overflow: 'hidden',
      border: `3px solid ${ST.navy}`,
      boxShadow: `0 6px 0 0 ${ST.navy}`,
      background: ST.navyDeep,
      maxHeight: '40vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: dimmed ? 0.7 : 1
    }}
  >
    <img
      src={src}
      alt="Selected image preview"
      style={{ width: '100%', height: 'auto', maxHeight: '40vh', objectFit: 'contain', display: 'block' }}
    />
  </div>
);
