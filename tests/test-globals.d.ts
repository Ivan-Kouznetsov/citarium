import type { CitariumSettings } from "../src/io/settings";

declare global {
  interface Window {
    _capturedSavedSettings?: Partial<CitariumSettings> | null;
    __lastSavePickerCall?: SaveFilePickerOptions | null;
    __lastSavedContent?: string | null;
    __savedNewFileJson?: string | null;
    __savedJsonData?: string | null;
    __fileContentStore?: string | null;
    __savedToOpenedFile?: boolean | null;
    __closedWindowCalled?: boolean | null;
    __messageBoxCalled?: boolean | null;
    __messageBoxOpts?: any;
    __saveProjectPayload?: any;
    __savePickerCalled?: boolean | null;
    __savedContent?: string | null;
  }
}

export {};
