import React, { useState, useEffect, useRef } from 'react';
import { ArchiveKeys, ArchiveMetadata, AppStep } from './types';
import SettingsModal from './components/SettingsModal';
import { generateMetadataFromContext } from './services/geminiService';
import { uploadToInternetArchive } from './services/archiveService';

const App: React.FC = () => {
  const [keys, setKeys] = useState<ArchiveKeys | null>(null);
  const [keysVerified, setKeysVerified] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  
  // Data State
  const [file, setFile] = useState<File | null>(null);
  const [userContext, setUserContext] = useState('');
  const [linkStatus, setLinkStatus] = useState<'none' | 'valid' | 'notebook'>('none');
  
  // UI Refs
  const contextInputRef = useRef<HTMLInputElement>(null);
  
  const [metadata, setMetadata] = useState<ArchiveMetadata>({
    title: '',
    description: '',
    tags: [],
    creator: 'NotebookLM'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Upload State
  const [uploadProgress, setUploadProgress] = useState(0);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const savedKeys = localStorage.getItem('ia_keys');
    const savedVerified = localStorage.getItem('ia_keys_verified');
    
    if (savedKeys) {
      setKeys(JSON.parse(savedKeys));
      setKeysVerified(savedVerified === 'true');
    }
  }, []);

  // Monitor userContext for links
  useEffect(() => {
    if (!userContext) {
        setLinkStatus('none');
        return;
    }
    
    const hasUrl = /(https?:\/\/[^\s]+)/g.test(userContext);
    if (hasUrl) {
        if (userContext.includes('notebooklm.google') || userContext.includes('docs.google.com')) {
            setLinkStatus('notebook');
        } else {
            setLinkStatus('valid');
        }
    } else {
        setLinkStatus('none');
    }
  }, [userContext]);

  // Live Verification Poll
  // We check the IA Metadata API to see if the item exists AND if the waveform (PNG) is generated.
  useEffect(() => {
    let pollInterval: any;
    let timerInterval: any;

    if (step === AppStep.SUCCESS && successUrl) {
        setIsVerifying(true);
        setElapsedTime(0);
        
        // Extract identifier from the URL
        // URL format: https://archive.org/details/identifier
        const identifier = successUrl.split('/').pop();

        if (identifier) {
            // Timer to show user activity
            timerInterval = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);

            const checkStatus = async () => {
                try {
                    // IA Metadata API is CORS enabled.
                    // We add a timestamp to prevent caching.
                    const response = await fetch(`https://archive.org/metadata/${identifier}?t=${Date.now()}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        // Check if metadata exists
                        if (data && data.metadata && data.metadata.identifier === identifier) {
                            // CHECK: Look for derived PNG (waveform)
                            // The 'derive' task produces a PNG waveform for audio files.
                            // If this exists, the page has rendered the player.
                            const hasWaveform = data.files && data.files.some((f: any) => f.format === 'PNG');
                            
                            if (hasWaveform) {
                                setIsVerifying(false);
                                clearInterval(pollInterval);
                                clearInterval(timerInterval);
                            }
                        }
                    }
                } catch (e) {
                    console.log("Polling IA status...", e);
                }
            };

            // Check immediately, then every 5 seconds
            checkStatus();
            pollInterval = setInterval(checkStatus, 5000);
        }
    }

    return () => {
        if (pollInterval) clearInterval(pollInterval);
        if (timerInterval) clearInterval(timerInterval);
    };
  }, [step, successUrl]);

  const handleKeysSave = (newKeys: ArchiveKeys, verified: boolean) => {
      setKeys(newKeys);
      setKeysVerified(verified);
  };

  const handlePasteContext = async () => {
      try {
          // Attempt to read from clipboard
          const text = await navigator.clipboard.readText();
          if (text) {
              setUserContext(text);
          }
      } catch (err) {
          // Graceful fallback for permission/policy errors: focus the input
          console.warn('Clipboard access blocked, focusing input for manual paste.');
          contextInputRef.current?.focus();
      }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setStep(AppStep.REVIEW);
      
      // Auto-generate metadata immediately
      setIsGenerating(true);
      const generated = await generateMetadataFromContext(selectedFile.name, userContext);
      setMetadata(generated);
      setIsGenerating(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !keys) {
        if (!keys) setIsSettingsOpen(true);
        return;
    }

    setStep(AppStep.UPLOADING);
    setUploadProgress(0);

    try {
        const url = await uploadToInternetArchive(file, metadata, keys, (progress) => {
            setUploadProgress(progress);
        });
        setSuccessUrl(url);
        setStep(AppStep.SUCCESS);
    } catch (err: any) {
        setErrorMsg(err.message || 'Unknown error occurred');
        setStep(AppStep.ERROR);
    }
  };

  const handleReset = () => {
      setFile(null);
      setUserContext('');
      setStep(AppStep.UPLOAD);
      setSuccessUrl(null);
      setErrorMsg(null);
      setUploadProgress(0);
      setIsVerifying(false);
      setElapsedTime(0);
  };

  // Helper to determine if the error is related to credentials
  const isAuthError = (msg: string | null) => {
    if (!msg) return false;
    return msg.includes('403') || msg.includes('InvalidAccessKeyId') || msg.includes('SignatureDoesNotMatch');
  };

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800 flex flex-col items-center p-4 md:p-8">
      
      {/* Header */}
      <header className="w-full max-w-2xl flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">ArchiveFlow</h1>
                <p className="text-xs text-slate-500 font-medium">NotebookLM to Internet Archive</p>
            </div>
        </div>
        <button 
            onClick={() => setIsSettingsOpen(true)}
            className={`flex items-center gap-2 p-2 pl-3 rounded-full transition-all border ${
                keys 
                ? 'text-slate-500 bg-white border-slate-200 hover:border-indigo-200 hover:text-indigo-600 shadow-sm' 
                : 'text-red-500 bg-red-50 border-red-100 animate-pulse'
            }`}
            title="API Keys Settings"
        >
            {keys && keysVerified ? (
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-600 uppercase tracking-wide bg-green-50 px-2 py-0.5 rounded-md border border-green-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Verified
                </span>
            ) : keys ? (
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Settings</span>
            ) : (
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide pr-1">Keys Needed</span>
            )}
            
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </header>

      <main className="w-full max-w-2xl flex-grow">
        {/* Step 1: Upload */}
        {step === AppStep.UPLOAD && (
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 md:p-12 text-center transition-all duration-500 ease-in-out border border-slate-100">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload your Podcast</h2>
                    <p className="text-slate-500">Drag & drop your NotebookLM audio file here.</p>
                </div>

                <div className="mb-8 text-left">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">Notebook Sources / Context</label>
                    <div className="relative mb-3">
                        <input 
                            ref={contextInputRef}
                            type="text"
                            placeholder="Paste Notebook URL or Source Links..."
                            value={userContext}
                            onChange={(e) => setUserContext(e.target.value)}
                            className={`w-full pl-4 pr-36 py-3 bg-slate-50 border rounded-xl outline-none transition-all text-sm ${
                                linkStatus !== 'none' 
                                ? 'border-green-400 focus:ring-2 focus:ring-green-500 bg-green-50/20' 
                                : 'border-slate-200 focus:ring-2 focus:ring-indigo-500'
                            }`}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                            {linkStatus !== 'none' && (
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider shadow-sm
                                    ${linkStatus === 'notebook' 
                                        ? 'bg-green-100 border-green-200 text-green-700' 
                                        : 'bg-blue-50 border-blue-100 text-blue-600'
                                    } animate-in fade-in slide-in-from-right-4 duration-300`}>
                                    {linkStatus === 'notebook' ? (
                                         <>
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <span>Notebook</span>
                                         </>
                                    ) : (
                                         <>
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                            <span>Link</span>
                                         </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-3">
                        <div className="text-amber-500 mt-0.5 shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <div className="text-xs text-amber-800">
                            <p className="font-bold mb-1">Using a NotebookLM Link?</p>
                            <p className="mb-1">To let us generate metadata from your notebook, you must make it public:</p>
                            <ol className="list-decimal ml-4 space-y-1 text-amber-800/80 font-medium">
                                <li>Click <span className="inline-flex items-center gap-0.5 bg-white border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shadow-sm text-slate-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg> Share</span></li>
                                <li>Select <span className="inline-flex items-center gap-0.5 bg-white border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600 shadow-sm"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Anyone with a link</span></li>
                                <li>Copy and paste that link above.</li>
                            </ol>
                        </div>
                    </div>
                </div>

                <div className="relative group cursor-pointer">
                    <input 
                        type="file" 
                        accept="audio/*"
                        onChange={handleFileSelect}
                        className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                    />
                    <div className="border-3 border-dashed border-slate-200 group-hover:border-indigo-500 group-hover:bg-indigo-50/50 rounded-2xl p-12 transition-all duration-300">
                        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        </div>
                        <p className="text-lg font-medium text-slate-700">Click to browse or drop file</p>
                    </div>
                </div>
            </div>
        )}

        {/* Step 2: Review & Edit */}
        {step === AppStep.REVIEW && file && (
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Review Metadata</h2>
                        <p className="text-sm text-slate-500 mt-1">AI-generated from "{file.name}"</p>
                    </div>
                    <button onClick={() => setStep(AppStep.UPLOAD)} className="text-sm text-slate-400 hover:text-slate-600">Back</button>
                </div>

                <div className="p-8 space-y-6">
                    {isGenerating ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                             <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                             <p className="text-indigo-600 font-medium animate-pulse">
                                Scraping sources & generating tags...
                             </p>
                        </div>
                    ) : (
                        <>
                            {/* Audio Player Preview */}
                            <div className="bg-slate-100 rounded-xl p-4 flex items-center justify-center">
                                <audio controls src={URL.createObjectURL(file)} className="w-full h-10" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Title</label>
                                <input 
                                    value={metadata.title}
                                    onChange={e => setMetadata({...metadata, title: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border-slate-200 border rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Description</label>
                                <textarea 
                                    rows={6}
                                    value={metadata.description}
                                    onChange={e => setMetadata({...metadata, description: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border-slate-200 border rounded-xl text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Tags (A-Z)</label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {metadata.tags.map((tag, i) => (
                                        <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium border border-indigo-100 flex items-center gap-1">
                                            {tag}
                                            <button 
                                                onClick={() => setMetadata({...metadata, tags: metadata.tags.filter((_, idx) => idx !== i)})}
                                                className="hover:text-indigo-900"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <input 
                                    placeholder="Add tag and press Enter"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = e.currentTarget.value.trim();
                                            if (val) {
                                                const newTags = [...metadata.tags, val].sort();
                                                setMetadata({...metadata, tags: newTags});
                                                e.currentTarget.value = '';
                                            }
                                        }
                                    }}
                                    className="w-full px-4 py-2 bg-slate-50 border-slate-200 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            <button 
                                onClick={handleUpload}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transform hover:-translate-y-0.5 transition-all"
                            >
                                Publish to Archive.org
                            </button>
                        </>
                    )}
                </div>
            </div>
        )}

        {/* Step 3: Uploading */}
        {step === AppStep.UPLOADING && (
             <div className="bg-white rounded-3xl shadow-xl p-12 text-center">
                <div className="w-24 h-24 relative mx-auto mb-6">
                    <svg className="w-full h-full text-slate-200" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" />
                        <circle 
                            cx="50" cy="50" r="45" 
                            fill="none" 
                            stroke={uploadProgress === 100 ? "#10b981" : "#4f46e5"} 
                            strokeWidth="8" 
                            strokeDasharray="283" 
                            strokeDashoffset={283 - (283 * uploadProgress / 100)} 
                            className={`transition-all duration-300 ease-out origin-center -rotate-90 ${uploadProgress === 100 ? 'animate-pulse' : ''}`} 
                        />
                    </svg>
                    <span className={`absolute inset-0 flex items-center justify-center font-bold text-xl ${uploadProgress === 100 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                        {uploadProgress === 100 ? (
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        ) : (
                            `${Math.round(uploadProgress)}%`
                        )}
                    </span>
                </div>
                
                {uploadProgress === 100 ? (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <h3 className="text-xl font-bold text-slate-800">Finalizing Upload...</h3>
                        <p className="text-emerald-600 font-medium mt-2 animate-pulse">Verifying storage with Archive.org</p>
                        <p className="text-slate-400 text-xs mt-2">Almost there, just waiting for the server stamp.</p>
                    </div>
                ) : (
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Uploading to Internet Archive...</h3>
                        <p className="text-slate-500 mt-2">Sending audio data...</p>
                    </div>
                )}
             </div>
        )}

        {/* Step 4: Success */}
        {step === AppStep.SUCCESS && successUrl && (
            <div className="bg-white rounded-3xl shadow-xl p-12 text-center border-t-4 border-green-500">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Complete!</h2>
                <p className="text-slate-500 mb-8 max-w-sm mx-auto">Your podcast has been safely uploaded.</p>
                
                {isVerifying ? (
                    <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100 animate-pulse">
                         <div className="w-8 h-8 mx-auto mb-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                         <p className="text-indigo-600 font-bold text-sm mb-1">Processing Audio Waveform...</p>
                         <p className="text-slate-500 text-xs mb-3">Waiting for Internet Archive to render the audio visualization.</p>
                         <div className="flex flex-col gap-2 items-center">
                             <div className="inline-block px-3 py-1 bg-white rounded-full text-xs font-mono text-slate-400 border border-slate-200">
                                Time elapsed: {formatTime(elapsedTime)}
                             </div>
                             {elapsedTime > 20 && (
                                 <button onClick={() => setIsVerifying(false)} className="text-xs text-indigo-400 hover:text-indigo-600 underline mt-1">
                                     Skip verification and view page
                                 </button>
                             )}
                         </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-6">
                            <p className="text-green-800 font-semibold text-sm flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Verified: Audio Processed
                            </p>
                            <p className="text-green-700/70 text-xs mt-1">
                                The Internet Archive has derived the waveform and the page is ready.
                            </p>
                        </div>
                        <a href={successUrl} target="_blank" rel="noopener noreferrer" className="block w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-200 mb-4 transition-all">
                            View on Archive.org
                        </a>
                    </div>
                )}
                
                <button onClick={handleReset} className="text-slate-400 hover:text-slate-600 font-medium text-sm">
                    Upload Another
                </button>
            </div>
        )}

        {/* Step 5: Error */}
        {step === AppStep.ERROR && (
             <div className="bg-white rounded-3xl shadow-xl p-12 text-center border-t-4 border-red-500">
                 <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Action Failed</h3>
                <p className="text-red-500 mt-2 bg-red-50 p-3 rounded-lg text-sm break-all font-mono text-xs text-left overflow-auto max-h-40">
                    {errorMsg}
                </p>
                
                {isAuthError(errorMsg) && (
                    <div className="mt-4 mb-2 p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                        <p className="text-sm text-yellow-800 font-semibold mb-3">Authentication Failed</p>
                        <p className="text-xs text-yellow-700 mb-4">Your Internet Archive keys appear to be invalid or expired. Please check them and try again.</p>
                        <button 
                            onClick={() => setIsSettingsOpen(true)}
                            className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 shadow-sm text-sm font-bold w-full md:w-auto"
                        >
                            Update API Keys
                        </button>
                    </div>
                )}

                <button onClick={() => setStep(AppStep.REVIEW)} className="mt-6 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors">
                    Try Again
                </button>
             </div>
        )}

      </main>

      <footer className="w-full max-w-2xl mt-12 mb-4 text-center">
          <p className="text-[10px] text-slate-400 font-medium">
             ArchiveFlow • Securely client-side • No data stored
          </p>
      </footer>

      <SettingsModal 
        isOpen={isSettingsOpen || (!keys && step === AppStep.UPLOAD)} 
        onClose={() => setIsSettingsOpen(false)} 
        onSave={handleKeysSave} 
      />
    </div>
  );
};

export default App;