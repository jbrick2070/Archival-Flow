import React, { useState, useEffect } from 'react';
import { ArchiveKeys } from '../types';
import { verifyCredentials } from '../services/archiveService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (keys: ArchiveKeys, verified: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
    const [accessKey, setAccessKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'error'>('idle');

    useEffect(() => {
        const savedKeys = localStorage.getItem('ia_keys');
        if (savedKeys) {
            const parsed = JSON.parse(savedKeys);
            setAccessKey(parsed.accessKey || '');
            setSecretKey(parsed.secretKey || '');
        }
        // Reset status when opening
        setVerificationStatus('idle');
    }, [isOpen]);

    const handleTestKeys = async () => {
        const cleanedAccess = accessKey.trim();
        const cleanedSecret = secretKey.trim();
        
        if (!cleanedAccess || !cleanedSecret) return;

        setVerifying(true);
        setVerificationStatus('idle');
        
        try {
            const isValid = await verifyCredentials({ accessKey: cleanedAccess, secretKey: cleanedSecret });
            setVerificationStatus(isValid ? 'success' : 'error');
        } catch (e) {
            setVerificationStatus('error');
        } finally {
            setVerifying(false);
        }
    };

    const handleSave = () => {
        const cleanedAccess = accessKey.trim();
        const cleanedSecret = secretKey.trim();

        if (!cleanedAccess || !cleanedSecret) {
            alert('Please enter both keys');
            return;
        }
        
        const newKeys = { accessKey: cleanedAccess, secretKey: cleanedSecret };
        const isVerified = verificationStatus === 'success';
        
        localStorage.setItem('ia_keys', JSON.stringify(newKeys));
        localStorage.setItem('ia_keys_verified', String(isVerified));
        
        onSave(newKeys, isVerified);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="bg-indigo-600 p-6">
                    <h2 className="text-white text-xl font-bold flex items-center gap-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11.536 9.464l-.354-.354a2 2 0 11-.707-.707l.354.354 2.828-2.829A1 1 0 0013 5a1 1 0 00-1-1H4" />
                        </svg>
                        Archive.org Keys
                    </h2>
                </div>
                
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                        Your keys are stored locally in your browser. 
                        Get them from <a href="https://archive.org/account/s3.php" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">archive.org/account/s3.php</a>
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Access Key</label>
                        <input
                            type="text"
                            value={accessKey}
                            onChange={(e) => { setAccessKey(e.target.value); setVerificationStatus('idle'); }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="Your Access Key"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                        <input
                            type="password"
                            value={secretKey}
                            onChange={(e) => { setSecretKey(e.target.value); setVerificationStatus('idle'); }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="Your Secret Key"
                        />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                         <button
                            onClick={handleTestKeys}
                            disabled={verifying || !accessKey || !secretKey}
                            className={`text-sm font-semibold flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors
                                ${verificationStatus === 'success' ? 'bg-green-100 text-green-700' : 
                                  verificationStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                            `}
                        >
                            {verifying && <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>}
                            {verificationStatus === 'success' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                            {verificationStatus === 'error' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                            
                            {verifying ? 'Testing...' : 
                             verificationStatus === 'success' ? 'Keys Verified' : 
                             verificationStatus === 'error' ? 'Invalid Keys' : 'Test Connection'}
                        </button>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <button 
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave}
                            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-lg shadow-indigo-200 font-medium"
                        >
                            Save Keys
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;