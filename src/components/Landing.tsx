import { useEffect, useState, type MouseEvent } from "react";
import {
  Apple,
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock3,
  Download,
  KeyRound,
  LockKeyhole,
  Mail,
  Menu,
  Mic,
  MonitorUp,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { BrandMark } from "./ui";

type LandingProps = { onGetStarted: () => void };

const APP_VERSION = "0.1.0";
const BUILDS_BASE = "https://nbrvmmafbartiqcniddy.supabase.co/storage/v1/object/public/builds/meetly";
const DOWNLOADS = {
  mac: { url: `${BUILDS_BASE}/${APP_VERSION}/macos/Meetly_${APP_VERSION}_x64.dmg`, label: "macOS", sizeMb: 5.8, requirement: "Apple Silicon & Intel" },
  windows: { url: `${BUILDS_BASE}/${APP_VERSION}/windows/Meetly_${APP_VERSION}_x64-setup.exe`, label: "Windows", sizeMb: 3.8, requirement: "Windows 10/11 · 64-bit" },
};

function detectPlatform(): "mac" | "windows" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return null;
}

export function Landing({ onGetStarted }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [platform, setPlatform] = useState<"mac" | "windows" | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const goTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="landing min-h-screen w-screen overflow-x-hidden overflow-y-auto text-slate-950">
      <header className="landing-nav sticky top-0 z-50 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <button onClick={() => goTo("top")} className="flex items-center gap-2.5" aria-label="Meetly home">
            <BrandMark />
            <span className="text-lg font-bold tracking-tight">Meetly</span>
          </button>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
            <button onClick={() => goTo("how-it-works")}>How it works</button>
            <button onClick={() => goTo("features")}>Features</button>
            <button onClick={() => goTo("download")}>Download</button>
            <button onClick={() => goTo("privacy")}>Privacy</button>
            <button onClick={() => goTo("faq")}>FAQ</button>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <button onClick={onGetStarted} className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
              Sign in
            </button>
            <button onClick={() => goTo("download")} className="landing-button landing-button-dark">
              Download <Download className="h-4 w-4" />
            </button>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-slate-100 bg-white px-5 py-5 md:hidden">
            <div className="flex flex-col gap-1">
              {["how-it-works", "features", "download", "privacy", "faq"].map((id) => (
                <button key={id} onClick={() => goTo(id)} className="rounded-lg px-3 py-3 text-left text-sm font-semibold capitalize hover:bg-slate-50">
                  {id.replace(/-/g, " ")}
                </button>
              ))}
              <button onClick={onGetStarted} className="landing-button landing-button-dark mt-3 justify-center">Get started free</button>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        <section className="landing-hero relative">
          <div className="landing-orb landing-orb-one" />
          <div className="landing-orb landing-orb-two" />
          <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-20 text-center sm:px-8 sm:pb-24 sm:pt-28">
            <div className="landing-reveal inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-indigo-700 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Private AI meeting notes — without the meeting bot
            </div>
            <h1 className="landing-reveal landing-delay-1 mx-auto mt-7 max-w-5xl text-balance text-[44px] font-black leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-[78px]">
              Every meeting becomes
              <span className="landing-gradient-text block">clear, useful work.</span>
            </h1>
            <p className="landing-reveal landing-delay-2 mx-auto mt-7 max-w-2xl text-balance text-lg leading-8 text-slate-600 sm:text-xl">
              Meetly captures the conversation, writes structured notes, finds decisions, and turns every commitment into an action item—while your meeting stays private.
            </p>
            <div className="landing-reveal landing-delay-3 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={DOWNLOADS[platform ?? "mac"].url} className="landing-button landing-button-primary w-full justify-center sm:w-auto">
                <Download className="h-4 w-4" /> Download for {DOWNLOADS[platform ?? "mac"].label}
              </a>
              <button onClick={() => goTo("product-demo")} className="landing-button landing-button-secondary w-full justify-center sm:w-auto">
                <Play className="h-4 w-4 fill-current" /> See how it works
              </button>
            </div>
            <div className="landing-reveal landing-delay-3 mt-4 text-xs font-semibold text-slate-500">
              <button onClick={() => goTo("download")} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-950">
                Other platform / system requirements
              </button>
              {" · "}
              <button onClick={onGetStarted} className="underline decoration-slate-300 underline-offset-2 hover:text-slate-950">
                Continue in the browser
              </button>
            </div>
            <div className="landing-reveal landing-delay-3 mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> No credit card</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> No bot joins</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> Bring your own AI key</span>
            </div>

            <ProductScene />
          </div>
        </section>

        <section className="border-y border-slate-200/70 bg-white py-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 text-center sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Built for the meetings that move work forward</p>
            <div className="flex flex-wrap justify-center gap-x-9 gap-y-3 text-sm font-bold text-slate-500">
              <span>1:1s</span><span>Sales calls</span><span>Standups</span><span>Interviews</span><span>Kickoffs</span><span>Customer research</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-section bg-white">
          <SectionHeading eyebrow="From call to clarity" title="Your follow-up is finished before the call ends." body="Meetly keeps the workflow simple: capture the meeting, understand what matters, then move the work forward." />
          <div className="mx-auto mt-14 grid max-w-6xl gap-5 px-5 sm:px-8 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <article key={step.title} className="landing-step-card relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-7">
                <span className="absolute right-6 top-5 text-5xl font-black text-slate-200">0{index + 1}</span>
                <span className="mb-8 grid h-12 w-12 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm"><step.icon className="h-5 w-5" /></span>
                <h3 className="text-xl font-bold tracking-tight">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
                <div className="mt-6 flex items-center gap-2 text-xs font-bold text-indigo-600">{step.detail} <ChevronRight className="h-3.5 w-3.5" /></div>
              </article>
            ))}
          </div>
        </section>

        <section id="product-demo" className="landing-section bg-slate-950 text-white">
          <SectionHeading dark eyebrow="One workspace, not another transcript folder" title="See the meeting. See the meaning. See what happens next." body="Move between notes, action items, and answers without rebuilding context in three different tools." />
          <InteractiveDemo />
        </section>

        <section id="features" className="landing-section bg-white">
          <SectionHeading eyebrow="Everything stays connected" title="More than a recorder. A memory for your team." body="Every feature is designed around a real post-meeting job, from finding one decision to sending the follow-up." />
          <div className="mx-auto mt-14 grid max-w-6xl gap-4 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="landing-feature-card rounded-2xl border border-slate-200 bg-white p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><feature.icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-base font-bold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="download" className="landing-section bg-slate-50">
          <SectionHeading eyebrow="Get the desktop app" title="One download. Recording in under a minute." body="Meetly runs natively on Mac and Windows so it can capture your microphone and system audio without a participant bot." />
          <div className="mx-auto mt-12 grid max-w-4xl gap-5 px-5 sm:grid-cols-2 sm:px-8">
            {(Object.entries(DOWNLOADS) as [keyof typeof DOWNLOADS, (typeof DOWNLOADS)[keyof typeof DOWNLOADS]][]).map(([key, build]) => (
              <a
                key={key}
                href={build.url}
                className="landing-download-card flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                  {key === "mac" ? <Apple className="h-6 w-6" /> : <MonitorUp className="h-6 w-6" />}
                </span>
                <h3 className="mt-6 text-xl font-bold tracking-tight">Meetly for {build.label}</h3>
                <p className="mt-2 text-sm text-slate-500">{build.requirement}</p>
                <div className="mt-6 flex items-center gap-2 text-sm font-bold text-indigo-600">
                  <Download className="h-4 w-4" /> Download{build.sizeMb ? ` (${build.sizeMb} MB)` : ""}
                </div>
                <p className="mt-3 text-xs text-slate-400">v{APP_VERSION} · unsigned build — your OS may ask you to confirm the first launch.</p>
              </a>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl px-5 text-center text-xs text-slate-400 sm:px-8">
            Prefer to read and organize notes without installing anything? <button onClick={onGetStarted} className="font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-950">Continue in the browser</button> — recording still requires the desktop app.
          </p>
        </section>

        <section id="privacy" className="landing-section landing-privacy">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <div className="landing-eyebrow"><ShieldCheck className="h-4 w-4" /> Privacy by architecture</div>
              <h2 className="mt-5 text-balance text-4xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">Your meeting is not our business model.</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Audio is captured by the desktop app without a bot joining your call. Connect your own provider key and control where AI processing happens. Meetly tracks the estimated cost before it surprises you.</p>
              <button onClick={onGetStarted} className="landing-button landing-button-dark mt-8">Set up your private workspace <ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRIVACY.map((item) => (
                <article key={item.title} className="rounded-2xl border border-white/80 bg-white/75 p-6 shadow-sm backdrop-blur">
                  <item.icon className="h-5 w-5 text-indigo-600" />
                  <h3 className="mt-4 font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="landing-section bg-white">
          <SectionHeading eyebrow="The important questions" title="Clear answers before you record." />
          <div className="mx-auto mt-12 max-w-3xl px-5 sm:px-8">
            {FAQS.map((faq) => (
              <details key={faq.question} className="landing-faq group border-b border-slate-200 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-left font-bold">
                  {faq.question}<span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-lg transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-2xl pt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-28">
          <div className="landing-cta relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-slate-950 px-6 py-14 text-center text-white sm:px-12 sm:py-20">
            <div className="landing-cta-glow" />
            <div className="relative">
              <WandSparkles className="mx-auto h-8 w-8 text-indigo-300" />
              <h2 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-black tracking-[-0.04em] sm:text-5xl">Leave the meeting with the work already organized.</h2>
              <p className="mx-auto mt-5 max-w-xl text-slate-300">Free to start. No credit card. Your keys, your data, your next step—clear.</p>
              <button onClick={onGetStarted} className="landing-button mt-8 bg-white text-slate-950 hover:bg-indigo-50">Get started free <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2 font-bold text-slate-900"><BrandMark /> Meetly</div>
          <p>Private AI meeting notes for focused teams.</p>
          <button onClick={onGetStarted} className="font-semibold hover:text-slate-950">Sign in</button>
        </div>
      </footer>
    </div>
  );
}

function ProductScene() {
  const tilt = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width - 0.5) * 8;
    const y = ((event.clientY - box.top) / box.height - 0.5) * -8;
    event.currentTarget.style.setProperty("--tilt-x", `${y}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${x}deg`);
  };
  const reset = (event: MouseEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div className="landing-scene mx-auto mt-16 max-w-5xl" onMouseMove={tilt} onMouseLeave={reset}>
      <div className="landing-app-window text-left">
        <div className="flex h-11 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4"><i /><i /><i /><span className="ml-auto text-[10px] font-semibold text-slate-400">Q3 planning · 32:18</span></div>
        <div className="grid min-h-[420px] md:grid-cols-[190px_1fr]">
          <aside className="hidden border-r border-slate-200 bg-slate-50/70 p-4 md:block">
            <div className="mb-5 flex items-center gap-2 text-sm font-bold"><BrandMark /> Meetly</div>
            {["Home", "Meetings", "Action items", "Ask Meetly"].map((item, i) => <div key={item} className={`mb-1 rounded-lg px-3 py-2 text-xs font-semibold ${i === 1 ? "bg-white shadow-sm" : "text-slate-500"}`}>{item}</div>)}
            <p className="mb-2 mt-6 px-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Projects</p>
            <div className="px-3 py-2 text-xs text-slate-600">Website launch</div><div className="px-3 py-2 text-xs text-slate-600">Customer research</div>
          </aside>
          <div className="p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Meeting notes</div><h3 className="mt-2 text-xl font-black sm:text-2xl">Q3 product planning</h3><p className="mt-1 text-xs text-slate-400">Today · 4 participants · 32 min</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">Notes ready</span></div>
            <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_220px]">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Summary</p><div className="mt-3 space-y-2"><div className="h-2.5 w-full rounded-full bg-slate-100" /><div className="h-2.5 w-11/12 rounded-full bg-slate-100" /><div className="h-2.5 w-3/4 rounded-full bg-slate-100" /></div><p className="mt-7 text-[10px] font-bold uppercase tracking-wider text-slate-400">Decisions</p><div className="mt-3 space-y-3">{["Move beta launch to September 12", "Prioritize onboarding before analytics"].map(x => <div key={x} className="flex gap-2 text-xs font-medium"><CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-500" />{x}</div>)}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Action items</p>{["Finalize launch brief", "Book user interviews", "Share revised timeline"].map((x, i) => <div key={x} className="mt-3 flex items-start gap-2 text-[11px]"><span className={`mt-0.5 h-3.5 w-3.5 rounded border ${i === 0 ? "border-indigo-400 bg-indigo-100" : "border-slate-300"}`} /><span>{x}<small className="mt-0.5 block text-[9px] text-slate-400">{i === 1 ? "Maya · Friday" : "Alex · Tomorrow"}</small></span></div>)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="landing-float-card landing-float-left"><span className="recording-dot h-2 w-2 rounded-full bg-red-500" /><b>Recording</b><span>12:48</span></div>
      <div className="landing-float-card landing-float-right"><Sparkles className="h-4 w-4 text-indigo-500" /><div><b>3 decisions found</b><span className="block">Notes updated live</span></div></div>
    </div>
  );
}

function InteractiveDemo() {
  const [tab, setTab] = useState(0);
  const panels = [
    { label: "Notes", icon: Sparkles, title: "A useful summary, not a wall of text", body: "Meetly organizes the conversation into summary, decisions, risks, open questions, and a suggested next agenda.", bullets: ["Launch moved to September 12", "Onboarding is the top product priority", "Three customer interviews needed this week"] },
    { label: "Actions", icon: CheckSquare, title: "Every commitment has an owner", body: "Action items flow into project boards with the person responsible, due date, priority, and a link back to the source meeting.", bullets: ["Alex · Finalize launch brief", "Maya · Book three user interviews", "Sam · Share the revised timeline"] },
    { label: "Ask AI", icon: Bot, title: "Ask your meeting history directly", body: "Search across meetings and projects in natural language. Answers cite the meetings they came from, so context is easy to verify.", bullets: ["What changed about the launch?", "Who owns customer interviews?", "What are the unresolved risks?"] },
  ];
  const current = panels[tab];
  return (
    <div className="mx-auto mt-14 max-w-6xl px-5 sm:px-8">
      <div className="grid overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] shadow-2xl lg:grid-cols-[290px_1fr]">
        <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r lg:p-7">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Explore the workspace</p>
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {panels.map((panel, i) => <button key={panel.label} onClick={() => setTab(i)} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${tab === i ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><panel.icon className="h-4 w-4" />{panel.label}</button>)}
          </div>
        </div>
        <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1fr] lg:p-14">
          <div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-300"><current.icon className="h-5 w-5" /></span><h3 className="mt-6 text-2xl font-black tracking-tight sm:text-3xl">{current.title}</h3><p className="mt-4 text-sm leading-7 text-slate-400">{current.body}</p></div>
          <div key={tab} className="landing-demo-panel rounded-2xl bg-white p-5 text-slate-950 shadow-xl"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-bold">{current.label}</span><span className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-bold text-indigo-600">AI generated</span></div>{current.bullets.map((bullet, i) => <div key={bullet} className="mb-3 flex items-start gap-3 rounded-xl border border-slate-100 p-3 text-xs font-semibold"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-50 text-[9px] font-black text-indigo-600">{i + 1}</span>{bullet}</div>)}</div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body, dark = false }: { eyebrow: string; title: string; body?: string; dark?: boolean }) {
  return <div className="mx-auto max-w-3xl px-5 text-center sm:px-8"><p className={`text-xs font-black uppercase tracking-[.2em] ${dark ? "text-indigo-300" : "text-indigo-600"}`}>{eyebrow}</p><h2 className={`mt-5 text-balance text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl ${dark ? "text-white" : "text-slate-950"}`}>{title}</h2>{body && <p className={`mx-auto mt-5 max-w-2xl text-base leading-7 ${dark ? "text-slate-400" : "text-slate-600"}`}>{body}</p>}</div>;
}

const STEPS = [
  { icon: Mic, title: "Capture privately", body: "The desktop app records your microphone and system audio. No participant bot, awkward announcement, or meeting link required.", detail: "Mac and Windows app" },
  { icon: Zap, title: "Understand instantly", body: "Live transcription becomes a structured brief with decisions, risks, questions, speakers, and the details worth remembering.", detail: "Your chosen AI provider" },
  { icon: CheckCircle2, title: "Move work forward", body: "Tasks get owners and due dates, follow-up emails are drafted, and every answer remains linked to its original meeting.", detail: "Projects stay connected" },
];

const FEATURES = [
  { icon: Mic, title: "Records the whole conversation", body: "Separate microphone and system-audio channels make speaker context clearer without inviting a bot." },
  { icon: CalendarClock, title: "Understands your calendar", body: "Upcoming events help title meetings, identify attendees, and prepare the right context." },
  { icon: Search, title: "Searches across every meeting", body: "Find an exact moment or ask a natural-language question across projects and meeting history." },
  { icon: CheckSquare, title: "Turns promises into tasks", body: "AI action items flow into a Kanban board, linked to the person, project, and source meeting." },
  { icon: Users, title: "Keeps speakers recognizable", body: "Rename, add, and reassign speakers so notes read like the people who were actually in the room." },
  { icon: Mail, title: "Drafts the follow-up", body: "Create an attendee-ready recap from the notes, decisions, and responsibilities in one click." },
];

const PRIVACY = [
  { icon: MonitorUp, title: "No meeting bot", body: "Capture happens on your computer. Meetly never appears as another participant in the call." },
  { icon: KeyRound, title: "Bring your own keys", body: "Connect supported AI providers directly and choose the model that fits your quality and cost." },
  { icon: Clock3, title: "Visible cost controls", body: "See usage estimates, set a monthly budget, and enable a hard stop before processing begins." },
  { icon: LockKeyhole, title: "Local-first by default", body: "Use Meetly locally, or opt into Supabase sync when you want your notes across devices." },
];

const FAQS = [
  { question: "Does a Meetly bot join my call?", answer: "No. The desktop app captures your microphone and system audio locally, so there is no extra participant in Zoom, Meet, Teams, or another calling app." },
  { question: "Can I use Meetly from the browser?", answer: "The web app is for reading, organizing, searching, and collaborating on synced notes. Recording requires the native Mac or Windows desktop app because browsers cannot reliably capture other applications' audio." },
  { question: "How does AI processing work?", answer: "You connect a supported provider key and choose the models used for transcription and notes. Meetly includes quality and cost presets, usage tracking, and budget controls." },
  { question: "Where is my data stored?", answer: "Meetly is local-first. Cloud sync is optional and uses your configured Supabase workspace when you want access across devices or team collaboration." },
  { question: "What happens after I stop recording?", answer: "Meetly finishes the transcript, creates structured notes, extracts decisions and action items, and lets you edit speakers, assign the meeting to a project, or draft a follow-up email." },
];
