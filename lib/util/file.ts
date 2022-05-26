import * as fs from 'fs-extra';
import * as path from 'path';

export async function getFiles(dir: string): Promise<any> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

export async function createSubdirs(existingPath: string, subPath: string): Promise<string> {
  let createdPath = existingPath;
  const dirs = subPath.split('/');
  for (const pathElem of dirs) {
    createdPath = path.join(createdPath, pathElem);
    try {
      await fs.access(createdPath, fs.constants.F_OK);
    } catch {
      await fs.mkdir(createdPath);
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
