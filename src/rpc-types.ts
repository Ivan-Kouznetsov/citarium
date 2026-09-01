import type { RPCSchema } from "electrobun/main";
import type { ProjectDict } from "./models";
import type { CitariumSettings } from "./io";

export type CitariumRPC = {
  bun: RPCSchema<{
    requests: {
      loadProject: {
        params: { filepath: string };
        response: { success: boolean; project?: ProjectDict; error?: string };
      };
      saveProject: {
        params: { filepath: string; project: ProjectDict };
        response: { success: boolean; filepath?: string; error?: string };
      };
      showMessageBox: {
        params: {
          type?: "info" | "warning" | "error" | "question";
          title?: string;
          message?: string;
          detail?: string;
          buttons?: string[];
          defaultId?: number;
          cancelId?: number;
        };
        response: { success: boolean; response: number; error?: string };
      };
      getSettings: {
        params: {};
        response: { success: boolean; settings: CitariumSettings; error?: string };
      };
      saveSettings: {
        params: { settings: Partial<CitariumSettings> };
        response: { success: boolean; settings?: CitariumSettings; error?: string };
      };
      openFileDialog: {
        params: { startingFolder?: string; allowedFileTypes?: string };
        response: { success: boolean; filepath: string | null; error?: string };
      };
      closeWindow: {
        params: {};
        response: { success: boolean; error?: string };
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};

