export interface ArchiveKeys {
    accessKey: string;
    secretKey: string;
}

export interface ArchiveMetadata {
    title: string;
    description: string;
    tags: string[];
    creator: string;
    subject?: string;
}

export enum AppStep {
    UPLOAD = 'UPLOAD',
    REVIEW = 'REVIEW',
    UPLOADING = 'UPLOADING',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR'
}

export interface UploadState {
    file: File | null;
    metadata: ArchiveMetadata;
    progress: number;
    error: string | null;
    iaUrl: string | null;
}