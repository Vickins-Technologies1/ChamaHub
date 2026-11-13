"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CreditCard,
  FileText,
  LockKeyhole,
  Menu,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const tabs = [
  { id: "overview", label: "Group overview", title: "See the health of every cycle at a glance.", text: "A calm dashboard keeps group balances, contribution progress and the next payout within easy reach.", icon: WalletCards },
  { id: "contributions", label: "Contributions", title: "Make every contribution easy to follow.", text: "Record payment methods and references, then see what is paid and outstanding before a payout is made.", icon: ReceiptText },
  { id: "members", label: "Member management", title: "Keep your group membership intentional.", text: "Invite people, approve participation, and assign the roles your group needs.", icon: UsersRound },
  { id: "payouts", label: "Payout management", title: "Keep every beneficiary and cycle in view.", text: "Set a rotation order, record a received payout, and move to the next round when the cycle is complete.", icon: CreditCard },
  { id: "meetings", label: "Meetings & announcements", title: "Keep the whole group connected.", text: "Schedule calls, capture attendance, save minutes and publish group announcements from one workspace.", icon: MessageSquareText },
];

const faqs = [
  ["What is ChamaPulse?", "ChamaPulse is a workspace for savings groups to organize members, contribution cycles, payouts, meetings, minutes and announcements."],
  ["Who can use ChamaPulse?", "Any organized savings group can use ChamaPulse. A moderator creates the group, then members join through an invitation and approval flow."],
  ["How do I create a savings group?", "Choose Create a Group, set the contribution amount, frequency and start date, then invite the members you want to manage together."],
  ["How do I join an existing group?", "Ask a group official to invite you. Use the email address or phone number on the invitation to create your member account."],
  ["How are contributions tracked?", "Officials can record contributions with an amount, payment method, reference and paid date. Members can see the resulting cycle progress."],
  ["How does payout rotation work?", "Your group sets the rotation order. When the current contribution pot is complete and the payout is recorded, an authorized official can advance the cycle."],
  ["Can group officials manage member permissions?", "Yes. Group administrators can approve members and assign administrator, treasurer, secretary and member roles."],
  ["Can members access ChamaPulse on mobile?", "Yes. The workspace is responsive so members can review group activity and upcoming cycles from a phone, tablet or desktop."],
  ["How do I get support?", "Start by contacting your group official for group access or account context. They can coordinate any follow-up needed for the workspace."],
];

const reveal = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://chamapulse.vickinstechnologies.com/#organization",
      name: "ChamaPulse",
      url: "https://chamapulse.vickinstechnologies.com/",
      logo: "https://chamapulse.vickinstechnologies.com/chamapulse-logo.png",
      parentOrganization: { "@type": "Organization", name: "Vickins Technologies", url: "https://www.vickinstechnologies.com/" },
    },
    {
      "@type": "WebSite",
      "@id": "https://chamapulse.vickinstechnologies.com/#website",
      name: "ChamaPulse",
      url: "https://chamapulse.vickinstechnologies.com/",
      publisher: { "@id": "https://chamapulse.vickinstechnologies.com/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      name: "ChamaPulse",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: "https://chamapulse.vickinstechnologies.com/",
      slogan: "Your Group. One Financial Pulse.",
      description: "A platform for managing group savings, contributions, payouts, financial records and collective savings goals.",
      publisher: { "@id": "https://chamapulse.vickinstechnologies.com/#organization" },
    },
  ],
};

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const reduceMotion = useReducedMotion();
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 24);
      setShowTop(window.scrollY > 350);
      const sections = ["overview", "features", "how-it-works", "security", "faq"];
      let current = "overview";
      for (const id of sections) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= 150) current = id;
      }
      setActiveSection(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        requestAnimationFrame(() => toggleRef.current?.focus());
      }
      if (event.key === "Tab" && sidebarRef.current) {
        const items = sidebarRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);

  function closeMenu() { setMenuOpen(false); requestAnimationFrame(() => toggleRef.current?.focus()); }

  const navItems = [["overview", "Overview"], ["features", "Features"], ["how-it-works", "How It Works"], ["security", "Security"], ["faq", "FAQ"]];

  return (
    <main className="landing-page">
      <div className="landing-slideshow" aria-hidden="true">
        <div className="landing-slideshow__image landing-slideshow__image--one" />
        <div className="landing-slideshow__image landing-slideshow__image--two" />
        <div className="landing-slideshow__image landing-slideshow__image--three" />
        <div className="landing-slideshow__image landing-slideshow__image--four" />
        <div className="landing-slideshow__wash" />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className={`landing-nav ${scrolled ? "landing-nav--scrolled" : ""}`}>
        <div className="landing-shell flex h-[72px] items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="ChamaPulse home"><BrandLogo size={34} priority /><span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-.04em] text-slate-950">ChamaPulse</span></Link>
          <nav className="landing-desktop-links" aria-label="Main navigation">{navItems.map(([id, label]) => <a key={id} href={`#${id}`} className={activeSection === id ? "is-active" : ""}>{label}</a>)}</nav>
          <div className="landing-nav-actions"><Link href="/member-login" className="landing-signin">Sign In</Link><Link href="/moderator-signup" className="landing-primary-sm">Create a Group <ArrowRight size={15} /></Link></div>
          <button ref={toggleRef} type="button" className="landing-menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="mobile-sidebar"><Menu size={20} /></button>
        </div>
        <AnimatePresence>{menuOpen ? <><motion.button aria-label="Close navigation backdrop" className="landing-sidebar-backdrop" onClick={closeMenu} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.nav ref={sidebarRef} id="mobile-sidebar" aria-label="Mobile navigation" aria-modal="true" role="dialog" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 340, damping: 36 }} className="landing-sidebar"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-5"><Link href="/" onClick={closeMenu} className="flex items-center gap-2" aria-label="ChamaPulse home"><BrandLogo size={30} /><span className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-950">ChamaPulse</span></Link><button type="button" onClick={closeMenu} className="landing-menu-button" aria-label="Close navigation"><X size={20} /></button></div><div className="grid gap-1 px-4 py-5">{navItems.map(([id, label]) => <a key={id} href={`#${id}`} onClick={closeMenu} className={`landing-side-link ${activeSection === id ? "is-active" : ""}`}>{label}<ChevronRight size={17} /></a>)}</div><div className="mt-auto grid gap-3 border-t border-slate-200 p-5"><Link href="/member-login" onClick={closeMenu} className="landing-secondary">Sign In</Link><Link href="/moderator-signup" onClick={closeMenu} className="landing-primary">Create a Group <ArrowRight size={16} /></Link></div></motion.nav></> : null}</AnimatePresence>
      </header>

      <section id="overview" className="landing-hero">
        <div className="landing-orb landing-orb--one" /><div className="landing-orb landing-orb--two" />
        <div className="landing-shell relative grid items-center gap-14 pb-20 pt-16 lg:grid-cols-[.86fr_1.14fr] lg:pb-28 lg:pt-24">
          <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="max-w-xl">
            <motion.div variants={reveal} className="landing-label"><span className="h-1.5 w-1.5 rounded-full bg-[#21c6ca]" /> Your Group. One Financial Pulse.</motion.div>
            <motion.h1 variants={reveal} className="landing-display mt-6">Group savings, <span>in sync.</span></motion.h1>
            <motion.p variants={reveal} className="landing-copy mt-6 text-[17px] leading-8">A group savings and investment management platform for contributions, payouts, financial records and shared goals. Bring your chama’s everyday money work into one clear, accountable workspace.</motion.p>
            <motion.div variants={reveal} className="mt-8 flex flex-wrap gap-3"><Link href="/moderator-signup" className="landing-primary">Create your group <ArrowRight size={18} /></Link><Link href="/member-signup" className="landing-secondary">Join a group <ChevronRight size={18} /></Link></motion.div>
            <motion.div variants={reveal} className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-slate-600">{["KES ready", "Controlled approvals", "Mobile-friendly"].map((item) => <span key={item} className="flex items-center gap-1.5"><Check size={14} className="text-blue-700" />{item}</span>)}</motion.div>
          </motion.div>
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 34, rotate: 1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.9, delay: 0.2 }}><DashboardPreview /></motion.div>
        </div>
      </section>

      <section className="landing-trust border-y border-slate-200/80"><div className="landing-shell grid gap-5 py-6 text-sm sm:grid-cols-3 sm:gap-8"><Trust icon={ShieldCheck} title="Role-aware access" detail="For each group member" /><Trust icon={CircleCheck} title="Clear cycle records" detail="Payments, references, payouts" /><Trust icon={Smartphone} title="Ready wherever you are" detail="Phone, tablet and desktop" /></div></section>

      <section id="product" className="landing-section"><div className="landing-shell"><Heading eyebrow="See the workspace" title="One calm place for the work your group already does." text="Explore a representative product preview. The figures below are sample data, included to show how ChamaPulse organizes group activity." /><div className="mt-12 grid gap-8 lg:grid-cols-[250px_1fr]"><div className="landing-tab-list" role="tablist" aria-label="ChamaPulse product sections">{tabs.map((tab) => { const Icon = tab.icon; const selected = tab.id === activeTab; return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => setActiveTab(tab.id)} className={selected ? "landing-tab landing-tab--active" : "landing-tab"}><Icon size={17} /><span>{tab.label}</span><ChevronRight size={15} className="ml-auto" /></button>; })}</div><div className="min-w-0"><AnimatePresence mode="wait"><motion.div key={active.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }}><p className="landing-eyebrow">Product demonstration</p><h3 className="landing-subheading mt-3">{active.title}</h3><p className="landing-copy mt-3 max-w-xl">{active.text}</p><ProductPreview type={active.id} /></motion.div></AnimatePresence></div></div></div></section>

      <section id="how-it-works" className="landing-section landing-section--ink"><div className="landing-shell"><Heading eyebrow="A simpler rhythm" title="Three steps. A clearer group." text="Set up a group once, then give each person a clear view of what is due, paid and next." /><div className="landing-steps mt-14">{[["01", "Create your group", "Configure contribution amounts, schedules and the payout rotation that fits your group."], ["02", "Invite your members", "Send invitations, approve membership and place each member in the right group role."], ["03", "Manage every cycle", "Track contributions, record received payouts and coordinate meetings and announcements."]].map(([number, title, text], index) => <motion.article key={number} initial={reduceMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .4 }} transition={{ delay: index * .12, duration: .55 }} className="landing-step"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></motion.article>)}</div></div></section>

      <section id="features" className="landing-section"><div className="landing-shell grid items-center gap-14 lg:grid-cols-[.8fr_1.2fr]"><div><Heading eyebrow="Finances without the fog" title="Know what your group has, and what still needs attention." text="Contribution progress, reference details and payout readiness are presented in a format that makes the next action obvious." /><Link href="/moderator-signup" className="landing-text-link mt-7">Create a group workspace <ArrowRight size={16} /></Link></div><FinancePreview /></div></section>

      <section className="landing-section landing-payout-section border-y border-slate-200 bg-[#f5f7fa]"><div className="landing-shell grid items-center gap-14 lg:grid-cols-[1.1fr_.9fr]"><PayoutPreview /><div><Heading eyebrow="Payout rotation" title="Make the next beneficiary visible to everyone." text="Set an order your group understands. ChamaPulse keeps the current recipient, upcoming recipients and completed cycle status together without claiming to automate the money movement." /><div className="mt-7 space-y-3 text-sm text-slate-600">{["Current recipient and payout status", "A clear order for the upcoming rounds", "Advancement after contributions and payout confirmation"].map((item) => <p key={item} className="flex items-center gap-2"><Check size={16} className="text-blue-700" />{item}</p>)}</div></div></div></section>

      <section className="landing-section"><div className="landing-shell grid items-center gap-14 lg:grid-cols-[.86fr_1.14fr]"><div><Heading eyebrow="Group life, organized" title="Manage people, meetings and messages with the same care as money." text="The workspace gives officials the tools to approve membership, coordinate calls, retain meeting minutes and keep the group informed." /><div className="mt-8 grid gap-5 sm:grid-cols-2"><Feature icon={UsersRound} title="Member management" text="Invites, approval and defined roles." /><Feature icon={CalendarDays} title="Meeting coordination" text="Calls, attendance and saved minutes." /></div></div><MeetingsPreview /></div></section>

      <section id="security" className="landing-section landing-security"><div className="landing-shell grid gap-12 lg:grid-cols-[.9fr_1.1fr]"><div><p className="landing-eyebrow text-cyan-300">Trust by design</p><h2 className="landing-heading mt-4 text-white">Your group needs visibility without losing control.</h2><p className="mt-5 max-w-xl text-[16px] leading-7 text-slate-300">ChamaPulse gives people access according to their group role, keeps membership approvals controlled, and puts contribution and payout records where the group can review them.</p><Link href="/moderator-signup" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white underline decoration-cyan-300 underline-offset-8">Set up your group securely <ArrowRight size={16} /></Link></div><div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2"><SecurityFeature icon={LockKeyhole} title="Verified accounts" text="Email verification is supported when email delivery is configured." /><SecurityFeature icon={BadgeCheck} title="Controlled approvals" text="Authorized group officials decide which invited members become active." /><SecurityFeature icon={UsersRound} title="Defined roles" text="Administrator, treasurer, secretary and member permissions support group operations." /><SecurityFeature icon={FileText} title="Transparent records" text="Contributions, payment references and payout status are visible in the workspace." /></div></div></section>

      <section className="landing-section overflow-hidden"><div className="landing-shell grid items-center gap-12 lg:grid-cols-[1fr_.82fr]"><div><Heading eyebrow="Designed for the whole group" title="The group view in your pocket." text="Members can review their current contribution cycle and upcoming payout information without waiting for a spreadsheet or a message thread." /><div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600"><span className="flex items-center gap-2"><Check size={16} className="text-blue-700" /> Responsive workspace</span><span className="flex items-center gap-2"><Check size={16} className="text-blue-700" /> Clear mobile actions</span></div></div><MobilePreview /></div></section>

      <section id="faq" className="landing-section landing-faq-section border-t border-slate-200 bg-[#f5f7fa]"><div className="landing-shell grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><Heading eyebrow="Questions, answered" title="Everything you need to get started." text="The details that matter before bringing your group into ChamaPulse." /></div><div className="border-t border-slate-200">{faqs.map(([question, answer], index) => <article key={question} className="border-b border-slate-200"><button type="button" className="flex w-full items-center justify-between gap-5 py-5 text-left text-[15px] font-semibold text-slate-900" onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}>{question}<ChevronDown size={18} className={`shrink-0 transition ${openFaq === index ? "rotate-180" : ""}`} /></button><AnimatePresence initial={false}>{openFaq === index ? <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><p className="max-w-2xl pb-5 text-sm leading-6 text-slate-600">{answer}</p></motion.div> : null}</AnimatePresence></article>)}</div></div></section>

      <section className="landing-final"><div className="landing-shell"><div className="relative overflow-hidden rounded-[28px] bg-[#0c2557] px-6 py-14 text-center text-white sm:px-12 sm:py-20"><div className="landing-final-orb" /><div className="relative mx-auto max-w-2xl"><p className="landing-eyebrow text-cyan-300">Ready for a better rhythm?</p><h2 className="landing-heading mt-4 text-white">Your group deserves better organization.</h2><p className="mx-auto mt-5 max-w-xl text-[16px] leading-7 text-blue-100">Start managing your savings group with greater clarity, accountability and confidence.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/moderator-signup" className="landing-primary landing-primary--light">Create your group <ArrowRight size={18} /></Link><Link href="/member-signup" className="landing-secondary landing-secondary--dark">Join a group <ChevronRight size={18} /></Link></div></div></div></div></section>
      <footer className="landing-footer border-t border-slate-200 bg-white"><div className="landing-shell flex flex-col gap-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2.5 text-slate-900"><BrandLogo size={28} /><span className="font-[family-name:var(--font-display)] font-bold tracking-[-.03em]">ChamaPulse</span></div><div className="flex flex-wrap gap-x-5 gap-y-2"><a href="#security">Security</a><a href="#faq">FAQ</a><Link href="/member-login">Sign in</Link></div><p className="text-xs">© 2026 ChamaPulse</p></div><div className="landing-shell flex justify-center border-t border-slate-100 py-3"><a className="landing-powered" href="https://www.vickinstechnologies.com/" target="_blank" rel="noopener noreferrer">Powered by Vickins Technologies</a></div></footer>
      <AnimatePresence><motion.button type="button" aria-label="Back to top" className="landing-back-top" onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" })} initial={{ opacity: 0, y: 10, scale: .9 }} animate={{ opacity: showTop ? 1 : 0, y: showTop ? 0 : 10, scale: showTop ? 1 : .9 }} transition={{ duration: .2 }} style={{ pointerEvents: showTop ? "auto" : "none" }}><ArrowUp size={19} /></motion.button></AnimatePresence>
    </main>
  );
}

function Heading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) { return <div className="max-w-2xl"><p className="landing-eyebrow">{eyebrow}</p><h2 className="landing-heading mt-4">{title}</h2>{text ? <p className="landing-copy mt-5">{text}</p> : null}</div>; }
function Trust({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) { return <div className="flex items-center gap-3"><Icon className="text-blue-700" size={20} /><span><strong>{title}</strong><br /><small>{detail}</small></span></div>; }
function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <div className="border-t border-slate-200 pt-4"><Icon size={19} className="text-blue-700" /><h3 className="mt-3 text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>; }
function SecurityFeature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <div className="bg-[#07152f] p-6"><Icon className="text-cyan-300" size={22} /><h3 className="mt-4 font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>; }

function DashboardPreview() { return <div className="landing-dashboard-wrap"><div className="landing-dashboard"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="h-2 w-2 rounded-full bg-[#21c6ca]" /> Kijani Savings Group</div><span className="landing-status">Sample workspace</span></div><div className="grid gap-5 p-5 sm:grid-cols-[132px_1fr]"><aside className="hidden space-y-1 border-r border-slate-100 pr-4 text-xs sm:block"><p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Workspace</p>{["Overview", "Contributions", "Members", "Payouts", "Meetings"].map((item, index) => <p key={item} className={index === 0 ? "rounded-lg bg-[#eaf1ff] px-2.5 py-2 font-semibold text-blue-700" : "px-2.5 py-2 text-slate-500"}>{item}</p>)}</aside><div><div className="flex items-start justify-between"><div><p className="text-xs text-slate-500">Good morning, Mercy</p><h3 className="mt-1 text-lg font-bold tracking-[-.03em] text-slate-950">October savings cycle</h3></div><span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700">On track</span></div><div className="mt-5 grid grid-cols-3 gap-2.5">{[["Group balance", "KES 42,000"], ["Active members", "12"], ["Payout date", "28 Oct"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 p-3"><p className="text-[9px] font-medium text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-900">{value}</p></div>)}</div><div className="mt-3 rounded-xl border border-slate-100 p-3.5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-800">Contribution performance</p><p className="mt-1 text-[10px] text-slate-500">9 of 12 members have contributed</p></div><p className="text-xs font-bold text-blue-700">75%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><motion.div initial={{ width: 0 }} whileInView={{ width: "75%" }} viewport={{ once: true }} transition={{ duration: 1.1 }} className="h-full rounded-full bg-gradient-to-r from-[#0d3caa] to-[#21c6ca]" /></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#f6f9ff] p-3"><p className="text-[10px] font-semibold text-slate-500">Upcoming payout</p><p className="mt-1 text-xs font-bold text-slate-900">Amina N. · KES 42,000</p></div><div className="rounded-xl bg-[#f7f9ff] p-3"><p className="text-[10px] font-semibold text-slate-500">Latest payment</p><p className="mt-1 text-xs font-bold text-slate-900">Peter O. · M-Pesa ref.</p></div></div></div></div></div></div>; }

function ProductPreview({ type }: { type: string }) { if (type === "contributions") return <ContributionsPreview />; if (type === "members") return <MembersPreview />; if (type === "payouts") return <PayoutPreview compact />; if (type === "meetings") return <MeetingsPreview />; return <DashboardPreview />; }

function ContributionsPreview() { return <div className="landing-preview mt-8"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">October cycle</p><h4 className="mt-1 font-bold text-slate-900">Contribution ledger</h4></div><span className="landing-status">Sample data</span></div><div className="mt-5 grid grid-cols-3 gap-3">{[["Collected", "KES 31,500"], ["Outstanding", "KES 10,500"], ["Rate", "75%"]].map(([label, value]) => <div key={label} className="border-l border-slate-200 pl-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>)}</div><div className="mt-6 overflow-hidden rounded-xl border border-slate-100"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400"><span>Member</span><span className="pr-2">Reference</span><span>Status</span></div>{[["Amina N.", "QJ82L7", "Paid"], ["Peter O.", "TJ61P4", "Paid"], ["Lilian W.", "—", "Due"]].map(([name, reference, status]) => <div key={name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center border-t border-slate-100 px-4 py-3 text-xs"><span className="font-semibold text-slate-800">{name}</span><span className="pr-2 text-slate-500">{reference}</span><span className={status === "Paid" ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{status}</span></div>)}</div></div>; }

function MembersPreview() { return <div className="landing-preview mt-8"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">Group membership</p><h4 className="mt-1 font-bold text-slate-900">People and roles</h4></div><span className="rounded-lg bg-[#0c3c9b] px-3 py-2 text-xs font-semibold text-white">Invite member</span></div><div className="mt-5 space-y-3">{[["Mercy K.", "Administrator", "Active"], ["Kevin A.", "Treasurer", "Active"], ["Carol M.", "Member", "Awaiting approval"]].map(([name, role, status]) => <div key={name} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{name.slice(0, 1)}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800">{name}</p><p className="text-[10px] text-slate-500">{role}</p></div><span className={status === "Active" ? "text-[10px] font-bold text-emerald-700" : "text-[10px] font-bold text-amber-700"}>{status}</span></div>)}</div></div>; }

function PayoutPreview({ compact = false }: { compact?: boolean }) { return <div className={compact ? "landing-preview mt-8" : "landing-payout-card"}><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">Rotation schedule</p><h4 className="mt-1 text-lg font-bold tracking-[-.02em] text-slate-900">Who receives next</h4></div><span className="landing-status">Round 4 of 12</span></div><div className="mt-7 space-y-0">{[["Current", "Amina N.", "Receiving this cycle"], ["Next", "Peter O.", "November cycle"], ["Then", "Lilian W.", "December cycle"]].map(([label, name, detail], index, values) => <div key={label} className="relative flex gap-4 pb-7 last:pb-0"><div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#0c3c9b] text-[10px] font-bold text-white">{index + 1}</div>{index < values.length - 1 ? <span className="absolute left-4 top-8 h-[calc(100%-16px)] w-px bg-blue-100" /> : null}<div className="pt-1"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-blue-700">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{name}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div></div>)}</div></div>; }

function MeetingsPreview() { return <div className="landing-preview"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">This week</p><h4 className="mt-1 font-bold text-slate-900">Group activity</h4></div><Bell size={18} className="text-blue-700" /></div><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_.8fr]"><div className="rounded-xl bg-[#eff5ff] p-4"><div className="flex items-center gap-2 text-xs font-bold text-blue-800"><CalendarDays size={15} /> Monthly check-in</div><p className="mt-4 text-lg font-bold text-slate-900">Thu, 7:00 PM</p><p className="mt-1 text-xs text-slate-600">Attendance and meeting details in one place.</p><span className="mt-4 inline-block rounded-lg bg-[#0c3c9b] px-3 py-2 text-xs font-semibold text-white">Open meeting</span></div><div className="rounded-xl border border-slate-100 p-4"><FileText size={17} className="text-blue-700" /><p className="mt-3 text-xs font-bold text-slate-900">Minutes saved</p><p className="mt-1 text-[11px] leading-5 text-slate-500">September decisions and action items are ready to review.</p></div></div></div>; }

function FinancePreview() { return <div className="landing-finance"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">Kijani Savings Group · sample data</p><h3 className="mt-1 text-2xl font-bold tracking-[-.04em] text-slate-950">KES 42,000</h3><p className="mt-1 text-xs text-slate-500">Expected group savings balance</p></div><div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><WalletCards size={20} /></div></div><div className="mt-8 flex h-40 items-end gap-3">{[48, 65, 55, 79, 72, 92, 76].map((height, index) => <div key={index} className="flex flex-1 flex-col justify-end"><motion.div initial={{ height: 0 }} whileInView={{ height: `${height}%` }} viewport={{ once: true }} transition={{ duration: .7, delay: index * .06 }} className={index === 5 ? "rounded-t-md bg-[#0c2557]" : "rounded-t-md bg-[#b9cdfc]"} /><span className="mt-2 text-center text-[9px] text-slate-400">{index + 1}</span></div>)}</div><div className="mt-7 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Paid</p><p className="mt-1 text-sm font-bold text-emerald-700">KES 31,500</p><p className="mt-1 text-xs text-slate-500">9 member contributions</p></div><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Outstanding</p><p className="mt-1 text-sm font-bold text-amber-700">KES 10,500</p><p className="mt-1 text-xs text-slate-500">3 members to record</p></div></div></div>; }

function MobilePreview() { return <div className="mx-auto w-[255px] rounded-[32px] border-[7px] border-[#0a1633] bg-[#07152f] p-2 shadow-[0_28px_60px_rgba(8,27,72,.25)]"><div className="overflow-hidden rounded-[22px] bg-white p-4"><div className="mx-auto h-1.5 w-16 rounded-full bg-slate-200" /><div className="mt-5 flex items-center gap-2"><BrandLogo size={26} /><div><p className="text-[9px] text-slate-500">Welcome back</p><p className="text-xs font-bold text-slate-900">Kijani Group</p></div></div><div className="mt-5 rounded-2xl bg-[#0c2557] p-4 text-white"><p className="text-[10px] text-blue-200">Your contribution status</p><p className="mt-2 text-xl font-bold">Paid</p><p className="mt-1 text-[10px] text-blue-100">KES 3,500 · October cycle</p></div><div className="mt-4"><p className="text-[10px] font-bold text-slate-500">UP NEXT</p><div className="mt-2 rounded-xl border border-slate-100 p-3"><p className="text-xs font-bold text-slate-900">Amina&apos;s payout</p><p className="mt-1 text-[10px] text-slate-500">28 October · KES 42,000</p></div></div><div className="mt-5 flex justify-around border-t border-slate-100 pt-3 text-[9px] font-semibold text-slate-500"><span className="text-blue-700">Overview</span><span>Groups</span><span>Ledger</span></div></div></div>; }
