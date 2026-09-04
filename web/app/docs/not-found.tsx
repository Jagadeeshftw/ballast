import { DOC_GROUPS, docHref } from "@/lib/docs-nav";

/** A docs 404, inside the shell, offering the pages that do exist. */
export default function DocsNotFound() {
  return (
    <div className="docLayout">
      <article className="docBody">
        <h1 className="docH1">There is no such page</h1>
        <p className="docLede">
          The documentation has nine pages. They are all in the sidebar, and all of them read
          without a wallet.
        </p>
        <div className="docCards">
          {DOC_GROUPS.flatMap((g) => g.pages).map((p) => (
            <a key={p.slug} className="docCard" href={docHref(p.slug)}>
              <span className="docCardTitle">{p.title}</span>
              <span className="docCardBlurb">{p.blurb}</span>
            </a>
          ))}
        </div>
      </article>
      <aside className="docTocCol" />
    </div>
  );
}
