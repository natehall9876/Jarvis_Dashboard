export const dynamic = 'force-dynamic';

/** Temporary acceptance harness. Shares normal production authentication;
 * the embedded document is the real app, with a 390 × 844 CSS viewport. */
export default function VerifyMobilePage() {
  return <section>
    <h1 className="mb-2 text-xl font-semibold">Production mobile acceptance · 390 × 844</h1>
    <p className="mb-3 text-sm">Real production pages and the current signed-in session. No fixtures or data overrides.</p>
    <iframe title="Jarvis mobile viewport" name="jarvis-mobile" src="/" width="390" height="844" style={{display:'block',width:390,height:844,border:'1px solid #777',background:'#101510'}} />
  </section>;
}
