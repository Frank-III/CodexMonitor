import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { FileDiff, type FileDiffOptions, type FileContents } from "@pierre/diffs";

export type DiffViewerProps = {
  oldFile?: FileContents;
  newFile?: FileContents;
  diffStyle?: "unified" | "split";
  theme?: "pierre-dark" | "pierre-light";
};

const DEFAULT_OPTIONS: Partial<FileDiffOptions<undefined>> = {
  theme: "pierre-dark",
  diffStyle: "unified",
  diffIndicators: "classic",
  overflow: "scroll",
  lineDiffType: "word",
  hunkSeparators: "metadata",
  expandUnchanged: true,
};

export function DiffViewer(props: DiffViewerProps) {
  let containerRef: HTMLDivElement | undefined;
  let instance: FileDiff | undefined;

  const options = createMemo<FileDiffOptions<undefined>>(() => ({
    ...DEFAULT_OPTIONS,
    theme: props.theme ?? "pierre-dark",
    diffStyle: props.diffStyle ?? "unified",
  }));

  onMount(() => {
    if (!containerRef) return;
    instance = new FileDiff(options());
  });

  createEffect(() => {
    if (!instance || !containerRef) return;

    const oldFile = props.oldFile;
    const newFile = props.newFile;

    if (!oldFile && !newFile) return;

    instance.setOptions(options());
    instance.render({
      oldFile,
      newFile,
      containerWrapper: containerRef,
    });
  });

  onCleanup(() => {
    instance?.cleanUp();
  });

  return <div ref={containerRef} class="diff-viewer-container" />;
}
