import * as fs from 'fs-extra';
import Client from 'ftp';
import * as path from 'path';

import * as log from './log';
import * as util from './util';

export default class ExportHandler {

  private static EXPORT_ROOT = process.env.EXPORT_ROOT || path.resolve(__dirname, '../../media');
  private static USE_FTP = Boolean(parseInt(process.env.USE_FTP || "0", 10));
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
    const files = await fs.readdir(torrentPath);
    const copyActions = files.map(filePath => {
      let from, to;
      try {
        from = path.join(torrentPath, filePath);
        to = path.join(exportPath, path.basename(filePath));
      } catch (err) {
        log.error(`Copy failed from ${from} to ${to}`);
        throw err;
      }
      return useFtp ? this.ftpCopy(from, to) : fs.copy(from, to);
    });
    await Promise.all(copyActions);
    console.warn('HHHHHH');
  }

  private ftpCopy(src: string, dst: string): Promise<void> {
    log.debug(`ExportHandler: ftpCopy(${src}, ${dst})`);
    const hostIp = ExportHandler.FTP_HOST_IP;
    const c = new Client();
    console.warn('DDDDDD');
    const directory = path.dirname(dst);
    console.warn('EEEEEE');
    return new Promise((resolve, reject) => {
      c.on('ready', async () => {
        console.warn('AAAAA');
        // Make the necessary directories
        c.mkdir(directory, true, (_mkDirErr: Error|undefined) => {
          console.warn('BBBBB', _mkDirErr);
          // Suppress errors thrown because the directory already exists.
          if (_mkDirErr && !/already exists/.exec(_mkDirErr.message)) {
            reject(`FTP mkDir error: ${_mkDirErr} (directory: ${directory})`);
          }
          // Copy the file
          c.put(src, dst, (_putErr: Error) => {
            console.warn('CCCCC', _putErr);
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
