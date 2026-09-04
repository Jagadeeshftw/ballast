import { neighbours, type DocPage } from "@/lib/docs-nav";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";

/**
 * One page's frame: heading, table of contents, body, previous/next.
 *
 * The TOC is built from a heading list the page passes in, NOT by scanning the DOM after
 * mount. Scanning would make the whole contents column depend on JavaScript, and this surface
 * has to be readable without it — so the same array that renders the TOC also renders the
 * headings, which means the two cannot disagree either.
 */
export type Heading = { id: string; text: string };

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="docH2 group/h">
      {children}
      <a href={`#${id}`} className="anchor" aria-label={`Link to ${typeof children === "string" ? children : "this section"}`}>#</a>
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h3 id={id} className="docH3">{children}</h3>;
}

function Toc({ headings }: { headings: Heading[] }) {
  if (headings.length === 0) return null;
  return (
    <nav className="docToc" aria-label="On this page">
      <div className="docTocTitle">On this page</div>
      <ol>
        {headings.map((h) => (
          <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>
        ))}
      </ol>
    </nav>
  );
}

export default function DocShell({
  slug, title, lede, headings, children,
}: {
  slug: string; title: string; lede?: React.ReactNode;
  headings: Heading[]; children: React.ReactNode;
}) {
  const { prev, next } = neighbours(slug);
  return (
    <div className="docLayout">
      <article className="docBody">
        <h1 className="docH1">{title}</h1>
        {lede && <p className="docLede">{lede}</p>}

        {/* On mobile the contents sit at the top as a disclosure; <details> so it opens
            without JavaScript. The desktop copy is the sticky column on the right. */}
        {headings.length > 0 && (
          <details className="docTocMobile">
            <summary>On this page</summary>
            <ol>
              {headings.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}
            </ol>
          </details>
        )}

        {children}

        <nav className="docPager" aria-label="Pages">
          {prev ? (
            <a href={`/docs/${prev.slug}`} className="docPrev">
              <IconArrowLeft size={15} stroke={1.8} aria-hidden="true" />
              <span><em>Previous</em>{prev.title}</span>
            </a>
          ) : <span />}
          {next ? (
            <a href={`/docs/${next.slug}`} className="docNext">
              <span><em>Next</em>{next.title}</span>
              <IconArrowRight size={15} stroke={1.8} aria-hidden="true" />
            </a>
          ) : <span />}
        </nav>
      </article>

      <aside className="docTocCol"><Toc headings={headings} /></aside>
    </div>
  );
}

export type { DocPage };
