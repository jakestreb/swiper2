import { AddTorrent } from './AddTorrent';

// For 'unreleased' movies without a clear release date, repeatedly search and set
// directly to 'downloading' when a torrent is found
export class CheckForRelease extends AddTorrent {
	public static schedule: JobSchedule = 'repeated';
	public static initDelayS: number = 60 * 60 * 12;
}
