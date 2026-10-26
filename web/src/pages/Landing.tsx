import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowRight, EyeSlash, Eye, Lightning, Handshake, Cpu, Storefront, ShieldCheck, Signature, ArrowsLeftRight, Clock, Wallet, GasPump, Fingerprint, Coins, MagnifyingGlass, Drop } from "@phosphor-icons/react";
import { Logo, ThemeToggle } from "../components/ui";

const STEPS = [
  { t: "Post sealed", d: "Sign a NEAR intent for your exact terms. It's sealed to the enclave; the board shows only pair, side and expiry.", I: Signature },
  { t: "Taker requests", d: "A signed-in taker taps Request. The enclave checks their sign-in and reveals the terms to them alone.", I: MagnifyingGlass },
  { t: "Negotiate", d: "Accept, counter or decline. Every counter is a fresh signed intent, private to the two of you.", I: ArrowsLeftRight },
  { t: "Settle atomically", d: "Matching intents go to execute_intents on the verifier. Both legs move in one transaction, or nothing does.", I: Lightning },
];
const FEATS = [
  { t: "TEE-sealed terms", d: "Size, price and notes are sealed to an OutLayer Intel TDX enclave.", I: Cpu },
  { t: "NEAR Intents settlement", d: "token_diff intents executed together by our own verifier copy.", I: ShieldCheck },
  { t: "Private counter-offers", d: "Accept / Counter / Decline, readable only by the two parties.", I: Handshake },
  { t: "No gas to trade", d: "You sign NEP-413 messages; the relayer pays for settlement.", I: GasPump },
  { t: "Expiry & cancel", d: "Deadlines expire offers; cancel burns your nonces on chain.", I: Clock },
  { t: "Google sign-in", d: "Privy gives you a NEAR implicit account. No seed phrase.", I: Fingerprint },
  { t: "Balances in the verifier", d: "Test tokens sit in the intents verifier, ready to settle any deal.", I: Wallet },
  { t: "Cross-chain deals", d: "Fund from Base, Arbitrum or Ethereum Sepolia, receive on any chain or NEAR. Settled by NEAR Intents; testnet bridging by Tidepool (1Click-compatible), mainnet by NEAR 1Click.", I: Drop },
  { t: "Test-token faucet", d: "USDC, USDT, wNEAR, ETH, wBTC and XAUT (Tidepool) in one click, straight into your balance.", I: Drop },
  { t: "Dry-run first", d: "simulate_intents checks every match before gas is spent.", I: Coins },
];
export default function Landing() {
  const [sc, setSc] = useState(false);
  useEffect(() => { const f = () => setSc(window.scrollY > 24); f(); addEventListener("scroll", f, { passive: true }); return () => removeEventListener("scroll", f); }, []);
  return (
    <div className="landing">
      <header className={`nav ${sc ? "scrolled" : ""}`}><div className="wrap nav-in">
        <Logo />
        <nav className="nav-links"><a href="#how">How it works</a><a href="#privacy">Privacy</a><a href="#features">Features</a><Link to="/app/wallet#faucet">Faucet</Link></nav>
        <div className="nav-cta"><ThemeToggle className="icon-btn" /><Link to="/app" className="btn btn-dark btn-sm">Open the board</Link></div>
      </div></header>
      <section className="hero"><div className="wrap hero-copy">
        <div className="chip fade-up"><Handshake size={14} weight="bold" /> Sealed in a TEE · settled with NEAR Intents</div>
        <h1 style={{ marginTop: 22 }}>Find your counterparty.<br />Keep your price.</h1>
        <p className="hero-sub fade-up">NEAR Private OTC is an open deal board where anyone can see a deal exists, but only the people you negotiate with see its size and price. When you both sign, one NEAR Intents call swaps both sides.</p>
        <div className="hero-ctas fade-up"><Link to="/app" className="btn btn-white btn-lg"><Storefront size={18} /> Browse deals <ArrowRight size={18} weight="bold" /></Link><Link to="/app/new" className="btn btn-glass btn-lg">Post a deal</Link></div>
        <div className="hero-trust fade-up"><span><EyeSlash size={16} /> Terms sealed</span><span><Handshake size={16} /> Private counters</span><span><Lightning size={16} /> Atomic, gasless to sign</span></div>
      </div></section>

      <section className="section" id="how"><div className="wrap">
        <div className="section-head"><div className="eyebrow">How it works</div><h2>Post. Request. Negotiate. Settle.</h2></div>
        <ol className="steps-row">{STEPS.map(({ t, d, I }, i) => (
          <li key={t} className="card step-card"><div className="step-top"><span className="step-n">{i + 1}</span><I size={22} weight="duotone" /></div><b>{t}</b><p>{d}</p></li>
        ))}</ol>
      </div></section>

      <section className="section band" id="privacy"><div className="wrap">
        <div className="section-head"><div className="eyebrow">Privacy</div><h2>What stays private, what's public</h2></div>
        <div className="compare2">
          <div className="card cmp priv"><h3><EyeSlash size={20} weight="duotone" /> Private</h3><ul><li>Exact size and price</li><li>Counter-offers and notes</li><li>Unfilled and cancelled deals</li><li>Signed intents before settlement</li></ul><p className="tiny muted">Sealed to the enclave; only the two parties can read them. The operator relays sealed blobs.</p></div>
          <div className="card cmp pub"><h3><Eye size={20} weight="duotone" /> Public</h3><ul><li>Pair, side, expiry, request count</li><li>Deal status</li><li>Settled transfers on NEAR</li><li>That an enclave job ran</li></ul><p className="tiny muted">The operator also sees which accounts requested or countered, never the terms.</p></div>
        </div>
      </div></section>

      <section className="section" id="features"><div className="wrap">
        <div className="section-head"><div className="eyebrow">Built on NEAR</div><h2>Everything a private desk needs</h2></div>
        <div className="feat-grid">{FEATS.map(({ t, d, I }) => (
          <div key={t} className="card feat-card"><span className="feat-ic"><I size={20} weight="duotone" /></span><b>{t}</b><p>{d}</p></div>
        ))}</div>
        <div style={{ textAlign: "center", marginTop: 40 }}><Link to="/app/how" className="btn btn-ghost">Full NEAR feature list & contracts</Link> <Link to="/app" className="btn btn-dark">Open the board <ArrowRight size={16} /></Link></div>
      </div></section>
      <footer className="footer"><div className="wrap footer-in"><Logo /><span className="muted small">NEAR testnet · open source · not financial advice</span></div></footer>
    </div>
  );
}
