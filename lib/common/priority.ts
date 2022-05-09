export function sortByPriority<T>(array: T[], priorityFn: (elem: T) => (number|boolean)[]): T[] {
  const copy = [...array];

  const withPriority = copy.map(elem => ({ elem, p: priorityFn(elem) }));
  withPriority.sort((a, b) => compareArrays(a.p, b.p));
  return withPriority.map(wp => wp.elem);
}

function compareArrays(a: (number|boolean)[], b: (number|boolean)[]): number {
  let i = 0;
  while (i < a.length) {
    const diff = Number(b[i]) - Number(a[i]);
    if (diff !== 0) {
      return diff;
    }
    i++;
  }
  return 0;
}
