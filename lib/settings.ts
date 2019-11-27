export const settings = {
  quality: {
    episode: [/1080p/gi, /720p/gi], // keyword preference order
    movie: [/1080p/gi, /720p/gi]
  },
  // Low seeder tier to determine download pick quality. Things with fewer seeders than this
  // will still be downloaded, but as a last priority.
  seeders: [{min: 30, points: 3.5}, {min: 20, points: 3}, {min: 12, points: 2}],
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
  // Sizes in MB - anything giving 0 points will not be downloaded
  size: {
    episode: [
      {min: 8000, points: 0},
      {min: 5000, points: 0.5},
      {min: 3000, points: 1},
      {min: 800, points: 1.5},
      {min: 200, points: 1}
    ],
    movie: [
      {min: 10000, points: 0},
      {min: 8000, points: 0.5},
      {min: 3000, points: 1},
      {min: 1600, points: 1.5},
      {min: 1000, points: 1},
      {min: 600, points: 0.5}
    ]
  },
  maxDownloads: 5,
  failedUpTime: 6, // Min number of hours for which failed items should remain in the failed list.
  clearFailedInterval: 60, // Interval in minutes to attempt to remove failed items.
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
