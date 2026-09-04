import "./docs.css";
import DocsSidebar from "./DocsSidebar";
import DocsTopBar from "./DocsTopBar";

export const metadata = {
  title: "Ballast — documentation",
  description:
    "How Ballast works, what its cover actually pays, what it costs, and what it does not do. Sourced from the contracts and the recorded run.",
};

/**
 * The docs shell. Deliberately the same skeleton as `/app`: the same rail component, the same
 * top bar conventions, the same tokens — a reader moving between the three surfaces should
 * never feel they changed sites.
 *
 * Server-rendered throughout. Nothing here needs JavaScript to be read.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="docs" className="app">
      <DocsSidebar />
      <div className="appMain">
        <DocsTopBar />
        <main>{children}</main>
      </div>
    </div>
  );
}
