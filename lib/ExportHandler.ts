import * as fs from 'fs-extra';
import Client from 'ftp';
import * as path from 'path';

import * as log from './log';
import * as util from './util';

const useFtp = Boolean(parseInt(process.env.USE_FTP || "0", 10));
const defaultExport = useFtp ? '.' : path.resolve(__dirname, '../../media');

export default class ExportHandler {

  private static EXPORT_ROOT = process.env.EXPORT_ROOT || defaultExport;
  private static USE_FTP = useFtp;
  private static FTP_HOST_IP = process.env.FTP_HOST_IP;

  constructor(public downloadRoot: string) {

  }

  // Save a video in the correct directory, adding any necessary directories.
  public async export(vt: VTorrent): Promise<void> {
    log.debug(`ExportHandler.export(${vt.video})`);
    const exportRoot = ExportHandler.EXPORT_ROOT;
    const useFtp = ExportHandler.USE_FTP;

    const safeTitle = vt.video.getFileSafeTitle();
    let dirs: string = '';
    if (vt.video.isMovie()) {
      dirs = path.join('movies', safeTitle)
    } else if (vt.video.isEpisode()) {
      dirs = path.join('tv', safeTitle, `Season ${vt.video.seasonNum}`);
    }

    if (!useFtp) {
      // The FTP copy process creates any folders needed in the FTP directory, but the
      // normal copy process does not.
      log.debug(`ExportHandler: Creating missing folders in export directory`);
      await util.createSubdirs(exportRoot, dirs);
    }
    const exportPath = path.join(exportRoot, dirs);

    // Move the files to the final directory.
    log.debug(`ExportHandler: Copying videos to ${exportPath}${useFtp ? 'via ftp' : ''}`);
    const torrentPath = path.join(this.downloadRoot, vt.getDownloadPath());
    const files = await util.getFiles(torrentPath);
    const copyActions = files.map((filePath: string) => {
      let from, to;
      try {
        from = filePath;
        to = path.join(exportPath, path.basename(filePath));
      } catch (err) {
        log.error(`Copy failed from ${from} to ${to}`);
        throw err;
      }
      return useFtp ? this.ftpCopy(from, to) : fs.copy(from, to);
    });
    // Perform actions sequentially
    for (const action of copyActions) {
      await action;
    }
  }

  private ftpCopy(src: string, dst: string): Promise<void> {
    log.debug(`ExportHandler: ftpCopy(${src}, ${dst})`);
    const hostIp = ExportHandler.FTP_HOST_IP;
    const c = new Client();
    const directory = path.dirname(dst);
    return new Promise((resolve, reject) => {
      c.on('ready', async () => {
        // Make the necessary directories
        c.mkdir(directory, true, (mkDirErr: Error|undefined) => {
          // Suppress errors thrown because the directory already exists.
          if (mkDirErr && !/already exists/.exec(mkDirErr.message)) {
            reject(`FTP mkDir error: ${mkDirErr} (directory: ${directory})`);
          }
          // Copy the file
          c.put(src, dst, (putErr: Error) => {
            if (putErr) {
              reject(`FTP put error: ${putErr}`);
            }
            c.end();
            resolve();
          });
        });
      });
      c.connect({ host: hostIp });
    });
  }
}
