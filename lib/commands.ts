
interface CommandDescriptor {
  arg?: string;
  desc: string;
}

export const commands: {[command: string]: CommandDescriptor} = {
  download: {
    arg: 'content',
    desc: "Downloads the best torrent for a show or movie."
  },
  search: {
    arg: 'content',
    desc: "Returns a list of torrents for a show or movie."
  },
  monitor: {
    arg: 'content',
    desc: "Adds an item to check on intermittently until it's found."
  },
  check: {
    desc: "Perform search for monitored items now."
  },
  info: {
    arg: 'content',
    desc: "Returns information about a show or movie."
  },
  remove: {
    arg: 'content',
    desc: "Removes the given item from monitored, queued, or downloading."
  },
  abort: {
    desc: "Aborts any downloads started by you."
  },
  cancel: {
    desc: "Ends the current conversation."
  },
  status: {
    desc: 'Shows items being monitored, queued, and downloaded.'
  },
  help: {
    arg: 'command (optional)',
    desc: "Returns the list of commands, or describes the given command."
  }
};
