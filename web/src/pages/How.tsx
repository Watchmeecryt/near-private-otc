import { Top } from "../app/Shell";
import { PrivacyNote } from "../components/ui";
import { FEATURES } from "../lib/features";
import { VERIFIER, TOKENS, KEEPER, EXPLORER } from "@shared/otc.mjs";

const STEPS = [
  ["Post", "You pick pair, size and price. Your browser builds a token_diff intent, you sign it (NEP-413), and the whole offer is sealed to the enclave's public key. The enclave reads it once and publishes only pair, side, a size band and expiry."],
  ["Request", "A taker signs in and taps Request. The enclave checks their Privy sign-in owns their NEAR account, then re-seals the exact terms to a one-time key in their browser."],
  ["Negotiate", "Accept, Counter or Decline. Each counter is a new signed intent sealed to the enclave and readable only by the two parties."],
  ["Settle", "On Accept the enclave checks both signed intents are exact mirror images and hands them to the relayer, which dry-runs simulate_intents and calls execute_intents. Both legs move in one transaction, or nothing moves."],
];
export default function How() {
  return (
    <>
      <Top title="How it works" sub="Plain-language tour, then every NEAR feature used." />
      <div className="form-narrow stack">
        <ol className="how-steps">{STEPS.map(([t, d], i) => <li key={t} className="card card-pad"><span className="num">{i + 1}</span><div><b>{t}</b><p className="small muted">{d}</p></div></li>)}</ol>
        <PrivacyNote />
        <div className="card card-pad"><h3 className="h3">Honest limits</h3><ul className="small muted bullets">
          <li>The operator's relayer sees <i>who</i> requests or counters a deal (account ids) and the coarse band, never the terms.</li>
          <li>At settlement both signed intents become public on NEAR, like any settled trade.</li>
          <li>One signed listing fills once (no partial fills). Post several smaller deals as tranches.</li>
          <li>Testnet only. Our own verifier copy, not the mainnet intents.near.</li></ul></div>
        <h3 className="h3" style={{ marginTop: 8 }}>NEAR features used</h3>
        {FEATURES.map(([t, d, l]) => <div key={t} className="card card-pad feat"><b>{t}</b><p className="small muted">{d}</p><a className="link tiny" href={l} target="_blank" rel="noreferrer">Docs ↗</a></div>)}
        <div className="card card-pad"><h3 className="h3">Contracts (testnet)</h3><ul className="small mono bullets">
          {[VERIFIER, KEEPER, ...TOKENS.map((t: any) => t.contract)].map((a) => <li key={a}><a className="link" href={`${EXPLORER}/address/${a}`} target="_blank" rel="noreferrer">{a} ↗</a></li>)}</ul></div>
      </div>
    </>
  );
}
