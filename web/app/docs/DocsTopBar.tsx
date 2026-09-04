import ThemeToggle from "@/components/site/ThemeToggle";
import { IconExternalLink } from "@tabler/icons-react";

const REPO = "https://github.com/Jagadeeshftw/ballast";

/** Network chip, links back to the other two surfaces, and the theme toggle. */
export default function DocsTopBar() {
  return (
    <header className="tbar">
      <span className="chip"><i className="dot live" aria-hidden="true" />Somnia testnet</span>
      <span className="chip">Docs</span>
      <span className="tbarGap" />
      <a className="chip" href="/">Landing page</a>
      <a className="chip" href="/app">Dashboard</a>
      <a className="chip" href={REPO} target="_blank" rel="noreferrer">
        Repo <IconExternalLink size={13} stroke={1.8} aria-hidden="true" />
      </a>
      <ThemeToggle className="chip themeBtn" />
    </header>
  );
}
