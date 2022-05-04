import * as fs from 'fs';
import Client from 'ftp';
import * as path from 'path';
import rmfr from 'rmfr';
import {promisify} from 'util';

import * as log from './common/logger';
import {getDescription, getFileSafeTitle} from './common/media';

const access = promisify(fs.access);
const mkdir = promisify(fs.mkdir);

export default class ExportHandler {

  private static EXPORT_ROOT = process.env.EXPORT_ROOT || path.resolve(__dirname, '../../media');
  private static USE_FTP = Boolean(parseInt(process.env.USE_FTP || "0", 10));
  private static FTP_HOST_IP = process.env.FTP_HOST_IP;

  constructor(public downloadRoot: string) {

  }

  // Save a video in the correct directory, adding any necessary directories.
  public async export(video: Video, downloadPaths: string[]): Promise<void> {
    log.debug(`export(${getDescription(video)}, ${downloadPaths})`);
    const exportRoot = ExportHandler.EXPORT_ROOT;
    const useFtp = ExportHandler.USE_FTP;

    const safeTitle = getFileSafeTitle(video);
    const dirs = video.type === 'movie' ? ['movies', safeTitle] :
      ['tv', safeTitle, `Season ${video.seasonNum}`];

    let exportPath = exportRoot;
    if (!useFtp) { log.debug(`exportVideo: Creating missing folders in export directory`); }
    for (const pathElem of dirs) {
      exportPath = path.join(exportPath, pathElem);
      if (!useFtp) {
        // The FTP copy process creates any folders needed in the FTP directory, but the
        // normal copy process does not.
        try {
          await access(exportPath, fs.constants.F_OK);
        } catch {
          // Throws when path does not exist
          await mkdir(exportPath);
        }
      }
    }

    // Move the files to the final directory.
    log.debug(`exportVideo: Copying videos to ${useFtp ? 'FTP server at ' : ''}${exportPath}`);
    const copyActions = downloadPaths.map(downloadPath => {
      const from = path.join(this.downloadRoot, downloadPath);
      const to = path.join(exportPath, path.basename(downloadPath));
      return useFtp ? this.ftpCopy(from, to) : copy(from, to);
    });
    await Promise.all(copyActions);

    // Remove the download directories (Remove the first directory of each downloaded file).
    log.debug(`exportVideo: Removing download directory`);
    const deleteActions = downloadPaths.map(downloadPath => {
      const abs = path.join(this.downloadRoot, path.dirname(downloadPath));
      return rmfr(abs);
    });
    await Promise.all(deleteActions);
  }

  private ftpCopy(src: string, dst: string): Promise<void> {
    const hostIp = ExportHandler.FTP_HOST_IP;
    const c = new Client();
    const directory = path.dirname(dst);
    return new Promise((resolve, reject) => {
      c.on('ready', async () => {
        // Make the necessary directories
        c.mkdir(directory, true, (_mkDirErr: Error|undefined) => {
          // Suppress errors thrown because the directory already exists.
          if (_mkDirErr && !/already exists/.exec(_mkDirErr.message)) {
            reject(`FTP mkDir error: ${_mkDirErr} (directory: ${directory})`);
          }
          // Copy the file
          c.put(src, dst, (_putErr: Error) => {
            if (_putErr) { reject(`FTP put error: ` + _putErr); }
            c.end();
            resolve();
          });
        });
      });
      c.connect({ host: hostIp });
    });
  }
}

function copy(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rd = fs.createReadStream(src);
    rd.on("error", err => {
      reject(err);
    });
    const wr = fs.createWriteStream(dst);
    wr.on("error", err => {
      reject(err);
    });
    wr.on("close", () => {
      resolve();
    });
    rd.pipe(wr);
  });
}
