import type { Electroview } from "electrobun/view";
import type { CitariumRPC } from "../rpc-types";
import type { CitariumApp } from "./app";
import type { CitariumSettings } from "../io/settings";

declare global {
  interface File {
    path?: string;
  }

  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
  }

  interface OpenFilePickerOptions {
    types?: FilePickerAcceptType[];
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    close(): Promise<void>;
  }

  interface FileSystemFileHandle {
    readonly name?: string;
    readonly kind?: "file";
    getFile(): Promise<File>;
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  }

  interface Window {
    __electrobunWebviewId?: number | string;
    electrobun?: Electroview<ReturnType<typeof Electroview.defineRPC<CitariumRPC>>>;
    app?: CitariumApp;
    showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    _capturedSavedSettings?: Partial<CitariumSettings> | null;
    __lastSavePickerCall?: SaveFilePickerOptions | null;
    __lastSavedContent?: string | null;
    __savedNewFileJson?: string | null;
    __savedJsonData?: string | null;
    __fileContentStore?: string | null;
    __savedToOpenedFile?: boolean | null;
  }
}

export {};
