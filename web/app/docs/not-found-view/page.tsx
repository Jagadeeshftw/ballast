import DocsNotFound from "../not-found";

/** Target of the middleware rewrite, so the 404 body renders inside the docs shell while the
 *  middleware supplies the 404 status. Same component the boundary uses. */
export default function NotFoundView() {
  return <DocsNotFound />;
}
