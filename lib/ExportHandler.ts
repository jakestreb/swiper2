import * as fs from 'fs-extra';
import Client from 'ftp';
import * as path from 'path';

import * as log from './common/logger';
import * as mediaUtil from './common/media';
import * as fileUtil from './common/files';

export default class ExportHandler {

  private static EXPORT_ROOT = process.env.EXPORT_ROOT || path.resolve(__dirname, '../../media');
  private static USE_FTP = Boolean(parseInt(process.env.USE_FTP || "0", 10));
  private static FTP_HOST_IP = process.env.FTP_HOST_IP;

  constructor(public downloadRoot: string) {

  }

  // Save a video in the correct directory, adding any necessary directories.
  public async export(vt: VTorrent): Promise<void> {
    log.debug(`ExportHandler.export(${mediaUtil.getDescription(vt.video)})`);
    const exportRoot = ExportHandler.EXPORT_ROOT;
    const useFtp = ExportHandler.USE_FTP;

    const safeTitle = mediaUtil.getFileSafeTitle(vt.video);
    const dirs = vt.video.type === 'movie' ? path.join('movies', safeTitle) :
      path.join('tv', safeTitle, `Season ${vt.video.seasonNum}`);

    if (!useFtp) {
      // The FTP copy process creates any folders needed in the FTP directory, but the
      // normal copy process does not.
      log.debug(`exportVideo: Creating missing folders in export directory`);
      await fileUtil.createSubdirs(exportRoot, dirs);
    }
    const exportPath = path.join(exportRoot, dirs);

    // Move the files to the final directory.
    log.debug(`exportVideo: Copying videos to ${useFtp ? 'FTP server at ' : ''}${exportPath}`);
    const torrentPath = path.join(this.downloadRoot, mediaUtil.getTorrentPath(vt));
    const files = await fs.readdir(torrentPath);
    const copyActions = files.map(filePath => {
      const from = path.join(torrentPath, filePath);
      const to = path.join(exportPath, path.basename(filePath));
      return useFtp ? this.ftpCopy(from, to) : fs.copy(from, to);
    });
    await Promise.all(copyActions);
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
