import { SolidMarkdown } from "solid-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  value: string;
  class?: string;
  codeBlock?: boolean;
};

export function Markdown(props: MarkdownProps) {
  const content = () => props.codeBlock ? `\`\`\`\n${props.value}\n\`\`\`` : props.value;
  return (
    <div class={props.class}>
      <SolidMarkdown remarkPlugins={[remarkGfm]}>{content()}</SolidMarkdown>
    </div>
  );
}
