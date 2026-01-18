export type RyuStackItem = {
  bookmark: string;
  markers: string;
  isWorkingCopy: boolean;
  changeId: string | null;
  commitId: string | null;
  summary: string | null;
};

export type RyuParsedStack = {
  title: string | null;
  items: RyuStackItem[];
};

export function parseRyuStdout(lines: string[]): RyuParsedStack {
  let title: string | null = null;
  const items: RyuStackItem[] = [];
  let currentItem: RyuStackItem | null = null;

  for (const line of lines) {
    if (!title) {
      const match = line.match(/^\s*Stack:\s*(.+?)\s*$/);
      if (match?.[1]) {
        title = match[1];
      }
    }

    const bookmarkMatch = line.match(/^\s*\[([^\]]+)\]\s*([*^@!]*)\s*$/);
    if (bookmarkMatch?.[1]) {
      currentItem = {
        bookmark: bookmarkMatch[1],
        markers: bookmarkMatch[2] ?? "",
        isWorkingCopy: false,
        changeId: null,
        commitId: null,
        summary: null,
      };
      items.push(currentItem);
      continue;
    }

    if (!currentItem) {
      continue;
    }

    const commitMatch = line.match(/^\s*([@o])\s+(\S+)\s+(\S+)\s+(.*)$/);
    if (!commitMatch) {
      continue;
    }

    currentItem.isWorkingCopy = commitMatch[1] === "@";
    currentItem.changeId = commitMatch[2] ?? null;
    currentItem.commitId = commitMatch[3] ?? null;
    currentItem.summary = commitMatch[4]?.trim() ?? null;
    currentItem = null;
  }

  return { title, items };
}

export function summarizeRyuMarkers(items: RyuStackItem[]) {
  const needsPush = items.some((item) => item.markers.includes("^"));
  const hasConflict = items.some((item) => item.markers.includes("!"));
  const hasSynced = items.some((item) => item.markers.includes("*"));
  const hasWorkingCopy = items.some((item) => item.isWorkingCopy);
  return { needsPush, hasConflict, hasSynced, hasWorkingCopy };
}

