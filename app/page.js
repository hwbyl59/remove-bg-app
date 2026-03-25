'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const fileInputRef = useRef(null);

  // Handle file selection
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
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  // Drag & drop handlers
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // Upload & process
  const handleUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append('image', selectedFile);

    try {
      const res = await fetch('/api/remove-bg', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResult(url);
      setUsageCount((c) => c + 1);
    } catch (err) {
      setError(err.message || 'Processing failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Download result
  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result;
    a.download = 'no-background.png';
    a.click();
  };

  // Reset
  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
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

        {/* Upload Card */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">

          {/* Drop Zone */}
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
            /* Preview Area */
            <div className="space-y-4">
              <div className="flex gap-4">
                {/* Original */}
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 text-center">Original</p>
                  <div className="checkerboard rounded-lg overflow-hidden aspect-square flex items-center justify-center">
                    <img src={preview} alt="Original" className="max-w-full max-h-64 object-contain" />
                  </div>
                </div>

                {/* Result */}
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
                    ) : error ? (
                      <div className="text-center text-red-400 text-sm px-4">{error}</div>
                    ) : (
                      <div className="text-slate-500 text-sm">Processing...</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-center pt-2">
                {!result && !error && (
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
                {error && (
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

        {/* Usage counter */}
        <div className="mt-4 text-center text-slate-500 text-sm">
          Processed {usageCount} image{usageCount !== 1 ? 's' : ''} this session
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Your images are processed and never stored. Powered by Remove.bg API.
        </p>
      </div>
    </main>
  );
}
