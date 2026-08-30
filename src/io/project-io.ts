/**
 * JSON Persistence and File Operations for Writing Projects.
 */
import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { dirname, resolve, join } from "path";
import { tmpdir } from "os";
import { Project } from "../models/project";

export class ProjectIOError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectIOError";
  }
}

/**
 * Save project to a JSON file safely using atomic write.
 */
export async function saveProject(project: Project, filepath: string): Promise<void> {
  project.markUpdated();
  const data = project.toDict();
  const jsonStr = JSON.stringify(data, null, 2);

  const targetDir = dirname(resolve(filepath));
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const tempFilePath = join(
    targetDir,
    `.citarium_tmp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.json`
  );

  try {
    await Bun.write(tempFilePath, jsonStr);
    renameSync(tempFilePath, filepath);
  } catch (err: unknown) {
    if (existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // ignore cleanup error
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ProjectIOError(`Failed to save project to '${filepath}': ${message}`, {
      cause: err,
    });
  }
}

/**
 * Load project from a JSON file.
 */
export async function loadProject(filepath: string): Promise<Project> {
  if (!existsSync(filepath)) {
    throw new ProjectIOError(`File not found: '${filepath}'`);
  }

  try {
    const file = Bun.file(filepath);
    const data = await file.json();
    return Project.fromDict(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ProjectIOError(`Failed to load project from '${filepath}': ${message}`, {
      cause: err,
    });
  }
}

/** Convert project to formatted JSON string. */
export function projectToJsonStr(project: Project): string {
  return JSON.stringify(project.toDict(), null, 2);
}

/** Parse project from JSON string. */
export function projectFromJsonStr(jsonStr: string): Project {
  const data = JSON.parse(jsonStr);
  return Project.fromDict(data);
}
