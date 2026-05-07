import { exec, ExecException, ExecOptions } from 'child_process';
import * as fs from 'fs/promises';

export async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  if (!isRecord(value)) throw new Error(`${filePath} must contain a JSON object`);
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Выполняет shell-команду */
export async function execCmd(
  command: string,
  options?: {
    encoding?: BufferEncoding;
  } & ExecOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(command, options ?? {}, (error: ExecException | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
