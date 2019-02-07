export const settings = {
  quality: {
    episode: [/1080p/gi, /720p/gi], // keyword preference order
    movie: [/1080p/gi, /720p/gi]
  },
  reject: [
    /\bHDCAM\b/gi,
    /\bCAMRip\b/gi,
    /\bCAM\b/gi,
    /\bTS\b/gi,
    /\bTELESYNC\b/gi,
    /\bPDVD\b/gi,
    /\bHD-?TS\b/gi,
    /\bHD-?TC\b/gi,
    /\bWP\b/gi,
    /\bWORKPRINT\b/gi,
    /\bHC\b/gi,
    /\bSUB\b/gi,
    /\bSUBS\b/gi,
    /\bKORSUB\b/gi,
    /\bKOR\b/gi,
    /\bTS-?RIP\b/gi
  ],
  // Maximum and minimum sizes in Mb to automatically download content
  size: {
    episode: {
      min: 150,
      max: 2800
    },
    movie: {
      min: 500,
      max: 5000
    }
  },
  maxDownloads: 5,
  failedUpTime: 6, // Min number of hours for which failed items should remain in the failed list.
  clearFailedAt: 2, // 0-23, hour at which failed items should be cleared.
  // Low seeder tier to determine download pick quality. Things with fewer seeders than this
  // will still be downloaded, but as a last priority.
  minSeeders: 10,
  monitorAt: 2, // 0-23, hour at which monitored should be searched for all items.
  daysBeforeDVD: 21, // Days before the DVD release day until monitoring searches for a movie.
  // Minutes in each repeat interval after release to search for a new episode. Stops retrying
  // when the end of the array is reached. When Swiper is started up, search begins starting in
  // the correct place. This is prevented from going past a day.
  newEpisodeBackoff: [30, 5, 5, 5, 10, 10, 10, 10, 15, 15, 30, 30, 30, 30, 60, 60, 120, 120, 240, 480],
  torrentsPerPage: 4, // Number of torrents to show at a time after searching.
  // Sunday - Saturday number of random movies to download that day at the monitorAt time.
  weeklyRandomMovies: [1, 0, 0, 0, 0, 2, 0],
  // Time before a random movie in the database is eligible to be downloaded again, in ms
  randomMovieTimeout: 365 * 24 * 60 * 60 * 1000,
  // Number 0 - 6 representing Sunday - Saturday, the weekday that upcoming movies should be added at
  // the monitorAt time. Add movies from the past 2 weeks.
  addUpcomingWeekday: 1
};
