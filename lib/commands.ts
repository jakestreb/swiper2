
interface CommandDescriptor {
  arg?: string;
  desc: string;
}

export const commands: {[command: string]: CommandDescriptor} = {
  download: {
    arg: 'CONTENT',
    desc: "Downloads the best torrent for a show or movie."
  },
  search: {
    arg: 'CONTENT',
    desc: "Returns a list of torrents for a show or movie."
  },
  monitor: {
    arg: 'CONTENT',
    desc: "Adds an item to check on intermittently until it's found."
  },
  check: {
    desc: "Perform search for monitored items now."
  },
  info: {
    arg: 'CONTENT',
    desc: "Returns information about a show or movie."
  },
  remove: {
    arg: 'CONTENT',
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
    arg: '[COMMAND]',
    desc: "Returns the list of commands, or describes the given command."
  }
};
