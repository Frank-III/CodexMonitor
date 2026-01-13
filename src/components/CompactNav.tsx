import type { ComponentProps } from "solid-js";

export type CompactNavTab = "workspaces" | "chat" | "panel";

type CompactNavProps = {
  activeTab: CompactNavTab;
  panelLabel: string;
  hasActiveWorkspace: boolean;
  onSelectTab: (tab: CompactNavTab) => void;
} & Omit<ComponentProps<"nav">, "children">;

const TAB_ORDER: CompactNavTab[] = ["workspaces", "chat", "panel"];

const TAB_LABEL: Record<CompactNavTab, string> = {
  workspaces: "Workspaces",
  chat: "Chat",
  panel: "Panel",
};

export function CompactNav(props: CompactNavProps) {
  return (
    <nav class="compact-nav" aria-label="Navigation" {...props}>
      {TAB_ORDER.map((tab) => {
        const disabled = (tab === "chat" || tab === "panel") && !props.hasActiveWorkspace;
        return (
          <button
            type="button"
            class="compact-nav-button"
            classList={{ active: props.activeTab === tab }}
            onClick={() => props.onSelectTab(tab)}
            disabled={disabled}
            aria-current={props.activeTab === tab ? "page" : undefined}
          >
            <span class="compact-nav-label">{TAB_LABEL[tab]}</span>
            {tab === "panel" ? (
              <span class="compact-nav-sublabel">{props.panelLabel}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

