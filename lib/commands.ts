
interface CommandDescriptor {
  args: string[];
  desc: string;
}

export const commands: {[command: string]: CommandDescriptor} = {
  download: {
    args: ['CONTENT'],
    desc: "downloads the best torrent for a show or movie"
  },
  search: {
    args: ['CONTENT'],
    desc: "returns a list of torrents for a show or movie"
  },
  reassign: {
    args: ['CONTENT'],
    desc: "reassigns the torrent for a downloading or previously downloaded video"
  },
  blacklist: {
    args: ['CONTENT'],
    desc: "blacklists and reassigns the torrent for a downloading or previously downloaded video"
  },
  monitor: {
    args: ['CONTENT'],
    desc: "adds an item to check on intermittently until it's found"
  },
  check: {
    args: [],
    desc: "perform search for monitored items now"
  },
  info: {
    args: ['CONTENT'],
    desc: "returns information about a show or movie"
  },
  remove: {
    args: ['CONTENT'],
    desc: "removes the given item from monitored, queued, or downloading"
  },
  reorder: {
    args: ['CONTENT'],
    desc: "moves the given item in the queue to download first or last"
  },
  abort: {
    args: [],
    desc: "aborts any downloads started by you"
  },
  random: {
    args: [],
    desc: "downloads a random movie from a list of favorites"
  },
  status: {
    args: [],
    desc: "shows items being monitored, queued, and downloaded"
  },
  suggest: {
    args: [],
    desc: "suggests upcoming and recent movies to monitor"
  },
  help: {
    args: ['[COMMAND]'],
    desc: "returns the list of commands, or describes the given command"
  },
  reboot: {
    args: [],
    desc: "restarts swiper"
  },
  cancel: {
    args: [],
    desc: "ends the current conversation"
  }
};
