
interface CommandDescriptor {
  args: string[];
  desc: string;
}

export const commands: {[command: string]: CommandDescriptor} = {
  download: {
    args: ['CONTENT'],
    desc: "Downloads the best torrent for a show or movie."
  },
  search: {
    args: ['CONTENT'],
    desc: "Returns a list of torrents for a show or movie."
  },
  reassign: {
    args: ['CONTENT'],
    desc: "Reassigns the torrent for a downloading or previously downloaded video."
  },
  blacklist: {
    args: ['CONTENT'],
    desc: "Blacklists and reassigns the torrent for a downloading or previously downloaded video."
  },
  monitor: {
    args: ['CONTENT'],
    desc: "Adds an item to check on intermittently until it's found."
  },
  check: {
    args: [],
    desc: "Perform search for monitored items now."
  },
  info: {
    args: ['CONTENT'],
    desc: "Returns information about a show or movie."
  },
  remove: {
    args: ['CONTENT'],
    desc: "Removes the given item from monitored, queued, or downloading."
  },
  reorder: {
    args: ['CONTENT', 'first/last'],
    desc: "Moves the given item in the queue to download first or last."
  },
  abort: {
    args: [],
    desc: "Aborts any downloads started by you."
  },
  random: {
    args: [],
    desc: "Downloads a random movie from a list of favorites."
  },
  status: {
    args: [],
    desc: "Shows items being monitored, queued, and downloaded."
  },
  help: {
    args: ['COMMAND'],
    desc: "Returns the list of commands, or describes the given command."
  },
  cancel: {
    args: [],
    desc: "Ends the current conversation."
  }
};
