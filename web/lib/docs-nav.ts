/**
 * The docs' single source of order.
 *
 * The sidebar, the previous/next links and the index cards all read this, so they cannot
 * disagree about what exists or what comes after what.
 */
export type DocPage = { slug: string; title: string; blurb: string };
export type DocGroup = { label: string; pages: DocPage[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    label: "Understanding",
    pages: [
      { slug: "what-it-is", title: "What it is",
        blurb: "The product in plain language, the three steps, and one worked example end to end." },
      { slug: "what-it-pays", title: "What it pays",
        blurb: "Parametric cover, the fixed payout, the three regions of the payoff, and basis risk." },
      { slug: "economics", title: "Economics",
        blurb: "Where the cover costs money: the spread, the roll frequency, and why 4h and 24h." },
    ],
  },
  {
    label: "Under the hood",
    pages: [
      { slug: "how-it-works", title: "How it works",
        blurb: "Three contracts, the reactive subscription, and the same-block path from trigger to cover." },
      { slug: "custody", title: "Custody",
        blurb: "Whose money it is, what consent means, and how revocation works." },
      { slug: "refusals", title: "Refusals",
        blurb: "Every reason Ballast declines to buy, and why declining is the product working." },
    ],
  },
  {
    label: "Honest",
    pages: [
      { slug: "findings", title: "Findings",
        blurb: "What we measured about Somnia and dreamDEX that is not in anyone's documentation." },
      { slug: "limitations", title: "Limitations",
        blurb: "What is untested, what cannot be covered, and what the record does not prove." },
    ],
  },
  {
    label: "Reference",
    pages: [
      { slug: "reference", title: "Reference",
        blurb: "Addresses, chain details, the engine set, links to every source document, and a glossary." },
    ],
  },
];

/** Flat reading order, which is what previous/next walk. */
export const DOC_ORDER: DocPage[] = DOC_GROUPS.flatMap((g) => g.pages);

export function neighbours(slug: string): { prev: DocPage | null; next: DocPage | null } {
  const i = DOC_ORDER.findIndex((p) => p.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: DOC_ORDER[i - 1] ?? null, next: DOC_ORDER[i + 1] ?? null };
}

export const docHref = (slug: string) => `/docs/${slug}`;
