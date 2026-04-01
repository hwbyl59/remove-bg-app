'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const USER_LIMIT = 4;

const PACKAGES = [
  { id: 'starter',      name: '尝鲜包',  price: '$1.99',  credits: 10,  desc: '适合偶尔使用' },
  { id: 'standard',     name: '标准包',  price: '$5.99',  credits: 50,  desc: '个人用户首选' },
  { id: 'professional', name: '专业包',  price: '$14.99', credits: 200, desc: '高频使用最划算' },
];

function decodeCredential(token) {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return payload;
  } catch {
    return null;
  }
}

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

  // Credits & payment state
  const [credits, setCredits] = useState(null);
  const [showBuyPanel, setShowBuyPanel] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null); // null | 'processing' | 'success' | 'failed' | 'cancelled'
  const [buyingPackage, setBuyingPackage] = useState(null);

  const applyCredential = useCallback((token) => {
    setCredential(token);
    setShowLoginPrompt(false);
    const payload = decodeCredential(token);
    setUserEmail(payload?.email ?? null);
    setUsesRemaining(null);
  }, []);

  const fetchCredits = useCallback(async (token) => {
    try {
      const res = await fetch('/api/credits/balance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits ?? 0);
      }
    } catch {
      // ignore — credits display is non-critical
    }
  }, []);

  const captureOrder = useCallback(async (orderId, token) => {
    setPaymentStatus('processing');
    try {
      const res = await fetch('/api/credits/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleToken: token, orderId }),
      });
      const data = await res.json();
      sessionStorage.removeItem('pp_order_id');
      if (data.credits !== undefined) {
        setCredits(data.credits);
        setPaymentStatus('success');
      } else {
        setPaymentStatus('failed');
      }
    } catch {
      setPaymentStatus('failed');
    }
  }, []);

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
        sessionStorage.setItem('gg_credential', token);
        applyCredential(token);
        fetchCredits(token);
      },
    });
    renderGoogleButton(googleButtonRef.current);
  }, [applyCredential, fetchCredits, renderGoogleButton]);

  // On mount: restore session, handle payment return
  useEffect(() => {
    const savedCred = sessionStorage.getItem('gg_credential');
    const pendingOrderId = sessionStorage.getItem('pp_order_id');
    const params = new URLSearchParams(window.location.search);
    const paymentParam = params.get('payment');

    if (paymentParam) {
      window.history.replaceState({}, '', '/');
    }

    if (savedCred) {
      // Restore session silently
      const payload = decodeCredential(savedCred);
      // Check token isn't expired
      if (payload?.exp && Date.now() / 1000 < payload.exp) {
        applyCredential(savedCred);
        fetchCredits(savedCred);

        if (paymentParam === 'success' && pendingOrderId) {
          captureOrder(pendingOrderId, savedCred);
        } else if (paymentParam === 'cancelled') {
          setPaymentStatus('cancelled');
          sessionStorage.removeItem('pp_order_id');
        }
      } else {
        // Token expired — clear storage
        sessionStorage.removeItem('gg_credential');
        sessionStorage.removeItem('pp_order_id');
        if (paymentParam === 'success') {
          // Needs re-login to complete capture
          setPaymentStatus('failed');
        }
      }
    } else if (paymentParam === 'cancelled') {
      setPaymentStatus('cancelled');
    }
  }, [applyCredential, fetchCredits, captureOrder]);

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
    sessionStorage.removeItem('gg_credential');
    sessionStorage.removeItem('pp_order_id');
    setCredential(null);
    setUserEmail(null);
    setUsesRemaining(null);
    setCredits(null);
    setShowBuyPanel(false);
    setPaymentStatus(null);
    setTimeout(() => renderGoogleButton(googleButtonRef.current), 0);
  };

  const handleBuyPackage = async (packageId) => {
    if (!credential || buyingPackage) return;
    setBuyingPackage(packageId);
    try {
      const res = await fetch('/api/credits/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleToken: credential, packageId }),
      });
      const data = await res.json();
      if (data.approvalUrl) {
        sessionStorage.setItem('pp_order_id', data.orderId);
        // credential already in sessionStorage — will be restored after redirect
        window.location.href = data.approvalUrl;
      } else {
        setError(data.error || 'Failed to create PayPal order.');
      }
    } catch {
      setError('Failed to initiate payment. Please try again.');
    } finally {
      setBuyingPackage(null);
    }
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
        } else if (data.requiresCredits) {
          setShowBuyPanel(true);
          setError(data.error || 'No credits remaining. Buy a package to continue.');
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

      const creditsRemaining = res.headers.get('X-Credits-Remaining');
      if (creditsRemaining !== null) {
        setCredits(parseInt(creditsRemaining, 10));
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

        {/* Payment status banners */}
        {paymentStatus === 'success' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-emerald-900/40 border border-emerald-700 rounded-xl text-emerald-300 text-sm">
            <span className="text-lg">🎉</span>
            <div>
              <span className="font-medium">Payment successful!</span>
              {credits !== null && <span className="text-emerald-400 ml-2">Your balance: {credits} credits</span>}
            </div>
            <button onClick={() => setPaymentStatus(null)} className="ml-auto text-emerald-500 hover:text-emerald-300">✕</button>
          </div>
        )}
        {paymentStatus === 'cancelled' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-slate-400 text-sm">
            <span>Payment cancelled.</span>
            <button onClick={() => setPaymentStatus(null)} className="ml-auto hover:text-slate-300">✕</button>
          </div>
        )}
        {paymentStatus === 'failed' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-900/40 border border-red-700 rounded-xl text-red-300 text-sm">
            <span>Payment processing failed. Please contact support with your PayPal transaction ID.</span>
            <button onClick={() => setPaymentStatus(null)} className="ml-auto hover:text-red-200">✕</button>
          </div>
        )}
        {paymentStatus === 'processing' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-indigo-900/40 border border-indigo-700 rounded-xl text-indigo-300 text-sm">
            <span className="animate-spin">⏳</span>
            <span>Confirming payment...</span>
          </div>
        )}

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
          <div className="flex items-center gap-2">
            {credential && credits !== null && (
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800">
                {credits} credit{credits !== 1 ? 's' : ''}
              </span>
            )}
            {usesRemaining !== null && (
              <span className={`text-xs px-2 py-1 rounded-full ${
                usesRemaining === 0
                  ? 'bg-red-900/40 text-red-400'
                  : usesRemaining === 1
                  ? 'bg-amber-900/40 text-amber-400'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {usesRemaining} free use{usesRemaining !== 1 ? 's' : ''} left
              </span>
            )}
          </div>
        </div>

        {/* Google Sign-In button — always in DOM, hidden when signed in */}
        <div
          ref={googleButtonRef}
          className={credential ? 'hidden' : 'mb-4 flex justify-center'}
        />

        {/* Buy Credits button & panel */}
        {credential && (
          <div className="mb-4">
            <button
              onClick={() => setShowBuyPanel((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-sm text-slate-300 transition-colors"
            >
              <span>💳 Buy Credits</span>
              <span className="text-slate-500 text-xs">{showBuyPanel ? '▲ Hide' : '▼ Show packages'}</span>
            </button>

            {showBuyPanel && (
              <div className="mt-2 grid grid-cols-3 gap-3">
                {PACKAGES.map((pkg) => (
                  <div key={pkg.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col items-center gap-2 text-center">
                    <div className="text-base font-semibold text-slate-200">{pkg.name}</div>
                    <div className="text-2xl font-bold text-indigo-400">{pkg.price}</div>
                    <div className="text-sm text-slate-300 font-medium">{pkg.credits} images</div>
                    <div className="text-xs text-slate-500">{pkg.desc}</div>
                    <button
                      onClick={() => handleBuyPackage(pkg.id)}
                      disabled={!!buyingPackage}
                      className="mt-1 w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                    >
                      {buyingPackage === pkg.id ? '...' : 'Buy'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
