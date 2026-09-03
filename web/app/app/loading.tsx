/**
 * Shown while a view's chain reads are in flight.
 *
 * Not a bare spinner. A spinner says "wait" and nothing else; this says what is being waited
 * on and roughly how long it takes, which is the difference between a page that feels slow
 * and one that feels broken. The shell around it is already painted, so only the body is
 * standing in.
 */
export default function Loading() {
  return (
    <div className="loadState" aria-live="polite" aria-busy="true">
      <p className="loadHead">
        <span className="loadDot" aria-hidden="true" />
        Reading Somnia
      </p>
      <p className="why">
        Every figure on this view is read from the chain at request time rather than from a
        cache of ours, so there is a round trip to the testnet RPC before anything can be
        shown. It usually takes two or three seconds.
      </p>
      <div className="loadBars" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </div>
  );
}
