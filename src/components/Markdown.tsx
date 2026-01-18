import { SolidMarkdown, type SolidMarkdownComponents } from "solid-markdown";
import remarkGfm from "remark-gfm";
import { FileMention } from "./FileMention";
import type { WorkspacePathPreviewStore } from "../stores/workspacePathPreview";

type MarkdownProps = {
  value: string;
  class?: string;
  codeBlock?: boolean;
  onOpenFile?: (path: string) => void;
  pathPreview?: WorkspacePathPreviewStore;
};

const trailingPunctuation = new Set([
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  ")",
  "]",
  "}",
  "\"",
  "'",
]);

function parseMentions(text: string, props: {
  preview: WorkspacePathPreviewStore;
  onOpenFile?: (path: string) => void;
}) {
  const nodes: Array<string | ReturnType<typeof FileMention>> = [];
  let last = 0;
  let scan = 0;

  while (scan < text.length) {
    const at = text.indexOf("@", scan);
    if (at === -1) {
      break;
    }

    if (at > 0 && /[A-Za-z0-9]/.test(text[at - 1])) {
      scan = at + 1;
      continue;
    }

    let end = at + 1;
    while (end < text.length && !/\s/.test(text[end])) {
      end += 1;
    }

    const raw = text.slice(at + 1, end);
    let mention = raw;
    let suffix = "";
    while (mention.length > 0 && trailingPunctuation.has(mention[mention.length - 1]!)) {
      suffix = `${mention[mention.length - 1]!}${suffix}`;
      mention = mention.slice(0, -1);
    }

    if (!mention || (!mention.includes("/") && !mention.includes("."))) {
      scan = at + 1;
      continue;
    }

    const isDir = mention.endsWith("/");
    const normalized = mention
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    if (at > last) {
      nodes.push(text.slice(last, at));
    }

    nodes.push(
      <FileMention
        kind={isDir ? "dir" : "file"}
        path={normalized}
        preview={props.preview}
        onOpenFile={props.onOpenFile}
      />,
    );

    if (suffix) {
      nodes.push(suffix);
    }

    last = end;
    scan = end;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes;
}

export function Markdown(props: MarkdownProps) {
  const content = () => props.codeBlock ? `\`\`\`\n${props.value}\n\`\`\`` : props.value;

  const components = (): SolidMarkdownComponents | undefined => {
    if (!props.pathPreview) {
      return undefined;
    }

    const preview = props.pathPreview;

    return {
      text: (textProps) => {
        const text = textProps.node.value;
        if (!text.includes("@")) {
          return text;
        }
        return <>{parseMentions(text, { preview, onOpenFile: props.onOpenFile })}</>;
      },
      code: (codeProps) => {
        const text = codeProps.node.children
          .map((child) => (child.type === "text" ? child.value : ""))
          .join("");
        return (
          <code class={codeProps.class} data-inline={codeProps.inline ? "true" : "false"}>
            {text}
          </code>
        );
      },
      a: (anchorProps) => {
        const text = anchorProps.node.children
          .map((child) => (child.type === "text" ? child.value : ""))
          .join("");
        return (
          <a href={anchorProps.href} title={anchorProps.title} target={anchorProps.target}>
            {text}
          </a>
        );
      },
    } satisfies SolidMarkdownComponents;
  };

  return (
    <div class={props.class}>
      <SolidMarkdown remarkPlugins={[remarkGfm]} components={components()}>
        {content()}
      </SolidMarkdown>
    </div>
  );
}
