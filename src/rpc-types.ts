import type { RPCSchema } from "electrobun/main";
import type { ProjectDict } from "./models";

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
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};
