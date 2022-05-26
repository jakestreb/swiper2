import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const access = promisify(fs.access);
const mkdir = promisify(fs.mkdir);

export async function createSubdirs(existingPath: string, subPath: string): Promise<string> {
  let createdPath = existingPath;
  const dirs = subPath.split('/');
  for (const pathElem of dirs) {
    createdPath = path.join(createdPath, pathElem);
    try {
      await access(createdPath, fs.constants.F_OK);
    } catch {
      await mkdir(createdPath);
    }
  }
  return createdPath;
}

// Format size with most appropriate suffix
export function formatSize(sizeMb: number): string {
  if (sizeMb < 1) {
    return `${sizeMb * 1024}KB`;
  } else if (sizeMb < 1024) {
    return `${sizeMb}MB`;
  }
  return `${sizeMb / 1024}GB`;
}
