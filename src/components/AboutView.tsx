const openUrl = (url: string) => window.open(url, "_blank");

const GITHUB_URL = "https://github.com/Frank-III/CodexMonitor";

type AboutViewProps = {
  version?: string | null;
};

export function AboutView(props: AboutViewProps) {
  return (
    <div class="about">
      <div class="about-card">
        <div class="about-header">
          <img
            class="about-icon"
            src="/app-icon.png"
            alt="Codex Monitor icon"
          />
          <div class="about-title">Codex Monitor</div>
        </div>
        <div class="about-version">
          {props.version ? `Version ${props.version}` : "Version —"}
        </div>
        <div class="about-tagline">
          Monitor the situation of your Codex agents
        </div>
        <div class="about-divider" />
        <div class="about-links">
          <button
            type="button"
            class="about-link"
            onClick={() => openUrl(GITHUB_URL)}
          >
            GitHub
          </button>
        </div>
        <div class="about-footer">Made with love by Claude & You</div>
      </div>
    </div>
  );
}
