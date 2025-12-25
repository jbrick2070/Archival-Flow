import { ArchiveKeys, ArchiveMetadata } from '../types';

const BASE_URL = 'https://s3.us.archive.org';

/**
 * Sanitize the identifier to be URL safe and IA compliant
 */
const generateIdentifier = (title: string): string => {
    const timestamp = Date.now();
    const cleanTitle = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, '');   // Trim hyphens
    
    // IA identifiers must be unique, so we append a timestamp
    return `notebooklm-archive-${cleanTitle.substring(0, 50)}-${timestamp}`;
};

/**
 * Verifies if the provided keys are valid by making a lightweight request to IA S3
 */
export const verifyCredentials = async (keys: ArchiveKeys): Promise<boolean> => {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', BASE_URL);
        xhr.setRequestHeader('Authorization', `LOW ${keys.accessKey}:${keys.secretKey}`);
        
        xhr.onload = () => {
            if (xhr.status === 200) {
                resolve(true);
            } else {
                console.warn(`Key verification failed with status: ${xhr.status}`);
                resolve(false);
            }
        };
        
        xhr.onerror = () => {
            console.error("Key verification network error");
            resolve(false);
        };

        xhr.send();
    });
};

/**
 * Sanitizes string for use in HTTP Headers (ISO-8859-1).
 * Robustly decodes URI components recursively to ensure plain text metadata.
 */
const sanitizeHeaderValue = (val: string): string => {
    if (!val) return '';
    
    let clean = val;
    
    // 1. Recursive Robust URI Decode
    // We loop to strip multiple layers of encoding (e.g. %2520 -> %20 -> " ")
    let loopCount = 0;
    while (/%[0-9A-F]{2}/i.test(clean) && loopCount < 5) {
        const previous = clean;
        clean = clean.replace(/%[0-9A-F]{2}/gi, (match) => {
            try { return decodeURIComponent(match); } catch { return match; }
        });
        
        // Break if no changes occurred to prevent infinite loops
        if (clean === previous) break;
        loopCount++;
    }

    // 2. Remove Newlines (Crucial for headers)
    clean = clean.replace(/[\r\n]+/g, ' ');

    // 3. Remove characters outside of standard Latin-1 range.
    // XMLHttpRequest headers generally support ISO-8859-1.
    clean = clean.replace(/[^\x00-\xFF]/g, ' ');

    // 4. Collapse multiple spaces
    clean = clean.replace(/\s+/g, ' ').trim();

    return clean;
};

export const uploadToInternetArchive = async (
    file: File,
    metadata: ArchiveMetadata,
    keys: ArchiveKeys,
    onProgress: (percent: number) => void
): Promise<string> => {
    const identifier = generateIdentifier(metadata.title);
    
    // Sanitize filename for the URL: remove weird chars, keep extension
    const ext = file.name.split('.').pop() || 'mp3';
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.[^.]+$/, '') + '.' + ext;
    
    const url = `${BASE_URL}/${identifier}/${safeFilename}`;

    // Construct Internet Archive specific S3-like headers
    // We explicitly DO NOT encodeURIComponent here because IA expects raw strings in headers
    // and handles UTF-8 (or Latin1 approximation) directly.
    const headers: Record<string, string> = {
        'Authorization': `LOW ${keys.accessKey}:${keys.secretKey}`,
        'x-archive-auto-make-bucket': '1', 
        'x-archive-meta-mediatype': 'audio',
        'x-archive-meta-collection': 'opensource_audio',
        'x-archive-meta-title': sanitizeHeaderValue(metadata.title),
        'x-archive-meta-creator': sanitizeHeaderValue(metadata.creator),
        'x-archive-meta-description': sanitizeHeaderValue(metadata.description),
        'x-archive-interactive-priority': '1', 
    };

    // Handle tags
    if (metadata.tags && metadata.tags.length > 0) {
        const cleanTags = metadata.tags.map(t => sanitizeHeaderValue(t)).filter(t => t.length > 0);
        if (cleanTags.length > 0) {
            headers['x-archive-meta-subject'] = cleanTags.join(';');
        }
    }

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                onProgress(percentComplete);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(`https://archive.org/details/${identifier}`);
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });

        xhr.open('PUT', url);
        
        Object.entries(headers).forEach(([key, value]) => {
            try {
                xhr.setRequestHeader(key, value);
            } catch (e) {
                console.error(`Failed to set header ${key}: ${value}`, e);
            }
        });

        xhr.send(file);
    });
};