'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const USER_LIMIT = 4;

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Auth state
  const [credential, setCredential] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [usesRemaining, setUsesRemaining] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const googleButtonRef = useRef(null);

  const renderGoogleButton = useCallback((container) => {
    if (!window.google || !container) return;
    window.google.accounts.id.renderButton(container, {
      theme: 'filled_black',
      size: 'medium',
      text: 'signin_with',
      shape: 'rectangular',
      locale: 'en',
    });
  }, []);

  const initGoogleSignIn = useCallback(() => {
    if (!window.google || !GOOGLE_CLIENT_ID) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: ({ credential: token }) => {
        setCredential(token);
        setShowLoginPrompt(false);
        // Decode JWT payload for display only (server verifies)
        try {
          const payload = JSON.parse(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
          );
          setUserEmail(payload.email ?? null);
          setUsesRemaining(null);
        } catch {
          setUserEmail(null);
        }
      },
    });
    renderGoogleButton(googleButtonRef.current);
  }, [renderGoogleButton]);

  useEffect(() => {
    if (window.google) {
      initGoogleSignIn();
    } else {
      const t = setInterval(() => {
        if (window.google) {
          clearInterval(t);
          initGoogleSignIn();
        }
      }, 100);
      return () => clearInterval(t);
    }
  }, [initGoogleSignIn]);

  const handleSignOut = () => {
    setCredential(null);
    setUserEmail(null);
    setUsesRemaining(null);
    setTimeout(() => renderGoogleButton(googleButtonRef.current), 0);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('File too large. Max 12MB.');
      return;
    }
    setSelectedFile(file);
    setResult(null);
    setError(null);
    setShowLoginPrompt(false);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowLoginPrompt(false);

    const form = new FormData();
    form.append('image', selectedFile);
    if (credential) {
      form.append('googleToken', credential);
    }

    try {
      const res = await fetch('/api/remove-bg', { method: 'POST', body: form });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        if (data.requiresLogin) {
          setShowLoginPrompt(true);
        } else {
          setError(data.error || 'Usage limit reached.');
        }
        setUsesRemaining(0);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const remaining = res.headers.get('X-Uses-Remaining');
      if (remaining !== null) {
        setUsesRemaining(parseInt(remaining, 10));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResult(url);
    } catch (err) {
      setError(err.message || 'Processing failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result;
    a.download = 'no-background.png';
    a.click();
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setShowLoginPrompt(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            🖼️ Image Background Remover
          </h1>
          <p className="text-slate-400">Powered by AI · No signup required · Free to try</p>
        </div>

        {/* Auth bar */}
        <div className="flex items-center justify-between mb-3 min-h-[36px]">
          {credential ? (
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span>Signed in as <span className="text-slate-200">{userEmail}</span></span>
              <button
                onClick={handleSignOut}
                className="text-slate-500 hover:text-slate-300 underline text-xs transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sign in for more free uses</div>
          )}
          {usesRemaining !== null && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              usesRemaining === 0
                ? 'bg-red-900/40 text-red-400'
                : usesRemaining === 1
                ? 'bg-amber-900/40 text-amber-400'
                : 'bg-slate-700 text-slate-400'
            }`}>
              {usesRemaining} use{usesRemaining !== 1 ? 's' : ''} remaining
            </span>
          )}
        </div>

        {/* Google Sign-In button — always in DOM, hidden when signed in */}
        <div
          ref={googleButtonRef}
          className={credential ? 'hidden' : 'mb-4 flex justify-center'}
        />

        {/* Upload Card */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">

          {!preview ? (
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${isDragging ? 'drop-zone-active border-indigo-400 bg-indigo-950/30' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/30'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-5xl mb-4">📁</div>
              <p className="text-lg font-medium text-slate-200">Drag & drop an image here</p>
              <p className="text-slate-400 mt-1">or click to browse</p>
              <p className="text-slate-500 text-sm mt-3">Supports JPG, PNG, WebP · Max 12MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 text-center">Original</p>
                  <div className="checkerboard rounded-lg overflow-hidden aspect-square flex items-center justify-center">
                    <img src={preview} alt="Original" className="max-w-full max-h-64 object-contain" />
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 text-center">Result</p>
                  <div className="bg-slate-900 rounded-lg overflow-hidden aspect-square flex items-center justify-center border border-slate-700">
                    {result ? (
                      <img src={result} alt="Result" className="max-w-full max-h-64 object-contain" />
                    ) : loading ? (
                      <div className="text-center">
                        <div className="text-4xl spin mb-2">⏳</div>
                        <p className="text-slate-400 text-sm">AI is working...</p>
                      </div>
                    ) : showLoginPrompt ? (
                      <div className="text-center px-4 py-6 space-y-2">
                        <p className="text-2xl">🔒</p>
                        <p className="text-slate-300 text-sm font-medium">Free trial used!</p>
                        <p className="text-slate-400 text-xs">Sign in above for {USER_LIMIT} more free uses.</p>
                      </div>
                    ) : error ? (
                      <div className="text-center text-red-400 text-sm px-4">{error}</div>
                    ) : (
                      <div className="text-slate-500 text-sm">Processing...</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-center pt-2">
                {!result && !error && !showLoginPrompt && (
                  <button
                    onClick={handleUpload}
                    disabled={loading}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    {loading ? '⏳ Processing...' : '✨ Remove Background'}
                  </button>
                )}
                {result && (
                  <>
                    <button
                      onClick={handleDownload}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      ⬇️ Download PNG
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                      🔄 New Image
                    </button>
                  </>
                )}
                {(error || showLoginPrompt) && (
                  <button
                    onClick={handleReset}
                    className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
                  >
                    🔄 Try Again
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Your images are processed and never stored. Powered by Remove.bg API.
        </p>
      </div>
    </main>
  );
}
