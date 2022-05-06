export function sortByPriority<T>(array: T[], priorityFn: (elem: T) => number[]): T[] {
  const copy = [...array];

  const withPriority = copy.map(elem => ({ elem, p: priorityFn(elem) }));
  withPriority.sort((a, b) => compareArrays(a.p, b.p));
  return withPriority.map(wp => wp.elem);
}

function compareArrays(a: number[], b: number[]): number {
  let i = 0;
  while (i < a.length) {
    const diff = b[i] - a[i];
    if (diff !== 0) {
      return diff;
    }
    i++;
  }
  return 0;
}
