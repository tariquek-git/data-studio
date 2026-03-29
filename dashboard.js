const benchmarks = [
  {
    id: "support",
    title: "General Support Pricing",
    category: "Reframe",
    brimLabel: "$2.25-$3.00 / min",
    marketLabel: "~$22 / hour median wage",
    brimValue: 180,
    marketValue: 22,
    delta: "6x-8x public wage anchor",
    description:
      "Brim’s published agent pricing reads like a fully loaded premium managed-service rate, not commodity support labor.",
    impact:
      "Buyers will challenge this immediately unless the rate is clearly positioned as bilingual, regulated, SLA-backed servicing with QA, workforce management, shrinkage, telecom, and compliance overhead included.",
    action:
      "Keep the premium if Brim is taking real operating responsibility, but sell it as a managed-services package or monthly/FTE commitment instead of a naked per-minute sticker price.",
    sourceLabel: "Job Bank Canada wage benchmark",
    sourceUrl: "https://www.jobbank.gc.ca/marketreport/wages-occupation/15201/ca",
  },
  {
    id: "sms",
    title: "SMS Pricing",
    category: "Fix Now",
    brimLabel: "$0.062-$0.10 / SMS",
    marketLabel: "~$0.0137-$0.017 / SMS raw",
    brimValue: 10,
    marketValue: 1.7,
    delta: "3.6x-7.3x transport benchmark",
    description:
      "Brim’s SMS line is far above public carrier-plus-delivery benchmarks and will be read as margin on a utility line unless it is bundled differently.",
    impact:
      "Procurement teams will compare this to public delivery pricing and assume Brim is marking up transport instead of charging for workflow, compliance, fraud logic, and managed operations.",
    action:
      "Either move standard SMS into a bundled allowance or show it as cost-plus with an explicit managed-service layer on top.",
    sourceLabel: "Twilio Canada SMS pricing",
    sourceUrl: "https://www.twilio.com/en-us/sms/pricing/ca",
  },
  {
    id: "email",
    title: "Email Pricing",
    category: "Fix Now",
    brimLabel: "$0.0082-$0.01 / email",
    marketLabel: "$0.00088 / extra email",
    brimValue: 1,
    marketValue: 0.088,
    delta: "9x-11x public overage rate",
    description:
      "Email looks especially hard to defend as a standalone priced item because public delivery rates are extremely low.",
    impact:
      "Charging premium rates for email makes the quote look over-instrumented and invites buyers to strip down the proposal instead of buying the full Brim stack.",
    action:
      "Bundle standard lifecycle email into the platform. Reserve overage pricing for unusual spikes or premium campaign support.",
    sourceLabel: "SendGrid pricing PDF",
    sourceUrl:
      "https://sendgrid.com/content/dam/sendgrid/global/en/other/sendgrid-pricing/twi121--sendgrid-pricing-pdf-st1.pdf",
  },
  {
    id: "ivr",
    title: "IVR Pricing",
    category: "Reframe",
    brimLabel: "$0.35 / min",
    marketLabel: "$0.0085-$0.014 / min raw",
    brimValue: 35,
    marketValue: 1.4,
    delta: "25x-41x raw telephony",
    description:
      "The IVR line is too high to be interpreted as just minutes. It has to be sold as managed IVR infrastructure and journey orchestration.",
    impact:
      "Without narrative, it reads like a telephony markup. With narrative, it can read like a regulated service layer that includes routing, menu design, self-serve flows, fraud escalation, and reporting.",
    action:
      "Rename and repackage it as managed IVR or bundle it into servicing. Do not leave it as a naked transport-style minute charge.",
    sourceLabel: "Twilio Canada voice pricing",
    sourceUrl: "https://www.twilio.com/en-us/voice/pricing/ca",
  },
  {
    id: "issuer",
    title: "Issuer Fee On Spend",
    category: "Defend",
    brimLabel: "10 bps of spend",
    marketLabel: "95-140 bps interchange context",
    brimValue: 10,
    marketValue: 95,
    delta: "Looks modest in context",
    description:
      "This line is not the commercial problem. Relative to published interchange benchmarks, Brim’s spend-based issuer fee is a small slice.",
    impact:
      "You can defend this as a reasonable program-management or issuer-services charge without looking out of line against public payments economics.",
    action:
      "Keep this rate. Focus pricing cleanup effort elsewhere, especially on fragmented operational and utility-style line items.",
    sourceLabel: "Finance Canada small-business interchange benchmark",
    sourceUrl:
      "https://www.canada.ca/en/department-finance/news/2024/10/government-announces-significant-new-support-to-help-small-business-owners.html",
  },
  {
    id: "ticket",
    title: "Average Ticket Assumption",
    category: "Defend",
    brimLabel: "$25-$65 model range",
    marketLabel: "$105 average Canadian credit-card transaction",
    brimValue: 65,
    marketValue: 105,
    delta: "Lower than broad market average",
    description:
      "Brim’s spend assumptions are conservative relative to the broad Canadian card market, which is not automatically bad but needs explicit explanation.",
    impact:
      "If the portfolio is truly low-ticket or secured, conservative spend makes sense. If not, the proposal may understate value creation and overstate cost pressure from low transaction economics.",
    action:
      "Tell a sharper portfolio story. Use customer-specific spend behavior instead of generic placeholders and show a downside, base, and upside scenario.",
    sourceLabel: "Payments Canada market release",
    sourceUrl:
      "https://www.newswire.ca/news-releases/canada-reaches-12-2-trillion-in-payment-transactions-in-2024-with-credit-cards-accounting-for-1-in-3-transactions-825863962.html",
  },
  {
    id: "losses",
    title: "Credit Loss Assumption",
    category: "Fix Now",
    brimLabel: "1.5% of avg balance",
    marketLabel: "4.15% net charge-off rate",
    brimValue: 1.5,
    marketValue: 4.15,
    delta: "Optimistic unless clearly secured",
    description:
      "The external model’s loss view is soft versus broad public credit-card loss benchmarks and only works cleanly if Brim is explicitly modeling a secured book.",
    impact:
      "A buyer will either challenge the realism of the economics or assume Brim is burying downside risk inside an unrealistically favorable portfolio shape.",
    action:
      "Call out secured versus unsecured mix explicitly and show a higher-loss sensitivity case to restore credibility.",
    sourceLabel: "FDIC credit-card charge-off benchmark",
    sourceUrl: "https://www.fdic.gov/system/files/2024-07/fdic-v18n1-4q2023.pdf",
  },
];

const architectures = {
  core: {
    kicker: "Best For Platform-Led Sales",
    title: "Core Platform",
    summary:
      "Use this when Brim wants to win on infrastructure, controls, and configurable issuance without inviting line-by-line teardown from procurement.",
    pricing: [
      "Recurring platform fee per account-on-file or active account",
      "Authorization or transaction processing fee",
      "Statement fee and a narrow set of true usage meters",
      "Annual minimum commitment with volume step-downs",
    ],
    included: [
      "Standard reporting and baseline portal access",
      "Normal lifecycle email allowance",
      "Base card controls and program configuration",
      "Clearly defined support tier and SLA",
    ],
    excluded: [
      "Call-centre labor and manual case handling",
      "Disputes, adjudication, and deep fraud review",
      "Third-party pass-throughs like print, bureau, and postage",
      "Bespoke launch work beyond standard implementation scope",
    ],
    narrative:
      "This tells buyers Brim is a serious platform, not a rate-card labyrinth. It reduces friction and makes benchmark conversations easier.",
    reaction:
      "Buyers see fewer surprise line items, so platform value becomes easier to compare and defend internally.",
  },
  managed: {
    kicker: "Best For Mid-Market Buyers",
    title: "Managed Operations",
    summary:
      "Use this when Brim is taking real operational work off the customer’s hands and wants a premium price that still feels packaged and digestible.",
    pricing: [
      "Platform fee plus a managed-operations monthly fee",
      "Unit pricing for cases, applications, disputes, or fraud reviews",
      "Bundled communications allowance with overage thresholds",
      "Optional staffing pods or SLA-based service bands",
    ],
    included: [
      "Fraud monitoring and manual investigation support",
      "Adjudication workflows and dispute handling",
      "Servicing operations with clear included volumes",
      "Operational reporting and governance cadences",
    ],
    excluded: [
      "Commodity-style email and SMS markups as standalone profit centers",
      "Undefined service creep hidden inside the base platform line",
      "Open-ended migration work without caps or bands",
      "Opaque pass-through vendor charges",
    ],
    narrative:
      "This is where Brim should live if it wants premium economics. The value story becomes operating leverage, not mystery margin.",
    reaction:
      "Buyers still negotiate, but they negotiate an operating model instead of reverse-engineering every unit rate.",
  },
  full: {
    kicker: "Best For Strategic, Full-Stack Programs",
    title: "Full Program",
    summary:
      "Use this when Brim is owning the program story end to end and can credibly price against speed, responsibility, and reduced internal headcount on the client side.",
    pricing: [
      "Implementation and launch workstream fee with milestone clarity",
      "Platform + managed services + issuer fee structure",
      "Pass-throughs separated from Brim margin lines",
      "Commercial guardrails such as caps, floors, and annual true-up logic",
    ],
    included: [
      "Program management and operational governance",
      "Managed servicing, fraud support, disputes, and reporting",
      "Clear inclusion of baseline comms and IVR capabilities",
      "Executive-level view of Year 1 all-in TCV and steady-state run rate",
    ],
    excluded: [
      "Broken or inconsistent assumption sets",
      "Profitability slides that omit upfront costs",
      "Revenue stories leaning too hard on punitive fees",
      "Any hidden ambiguity around what Brim actually owns",
    ],
    narrative:
      "This lets Brim stay premium without looking opportunistic. The customer is buying responsibility, speed, and a durable operating model.",
    reaction:
      "Enterprise buyers can accept a higher number if the scope is packaged cleanly and the total cost view is complete.",
  },
};

const actions = [
  {
    title: "Rebuild one master assumptions model",
    category: "fix-now",
    description:
      "Use one assumption set for users, active rate, transactions, ticket size, losses, and included services across every output.",
  },
  {
    title: "Move email and SMS into bundles or pass-throughs",
    category: "fix-now",
    description:
      "Utility-style messaging is the easiest thing for procurement to benchmark and attack. Make it less visible as a margin line.",
  },
  {
    title: "Package servicing as managed operations",
    category: "reframe",
    description:
      "Replace naked per-minute sticker shock with monthly commitment, hourly pods, or clearly bounded case-based pricing.",
  },
  {
    title: "Keep the issuer fee intact",
    category: "defend",
    description:
      "The 10 bps spend-based fee is not what makes the proposal look stretched. Use your energy elsewhere.",
  },
  {
    title: "Show Year 1 all-in TCV",
    category: "fix-now",
    description:
      "Implementation, migration, wallet, training, and other launch costs should appear in the total cost view, not off to the side.",
  },
  {
    title: "Publish base, downside, and upside cases",
    category: "reframe",
    description:
      "A single polished scenario feels like sales math. A disciplined scenario set feels like finance.",
  },
  {
    title: "State secured vs unsecured mix explicitly",
    category: "fix-now",
    description:
      "If the economics assume a secured book, say so clearly and show the customer what changes if the mix shifts.",
  },
  {
    title: "Use four pricing buckets only",
    category: "defend",
    description:
      "One-time, recurring platform, usage, and pass-through is easier to sell than dozens of fragmented rows.",
  },
  {
    title: "Add caps or bands to migration pricing",
    category: "reframe",
    description:
      "Per-record migration without a cap creates open-ended buyer anxiety and slows approval.",
  },
];

const sources = [
  {
    pill: "Official",
    title: "Twilio Voice Canada",
    description: "Raw telephony minute benchmark used to evaluate IVR and support framing.",
    url: "https://www.twilio.com/en-us/voice/pricing/ca",
  },
  {
    pill: "Official",
    title: "Twilio SMS Canada",
    description: "Public delivery and carrier-fee anchor for SMS pricing discussions.",
    url: "https://www.twilio.com/en-us/sms/pricing/ca",
  },
  {
    pill: "Official",
    title: "SendGrid Pricing",
    description: "Public email benchmark used to evaluate lifecycle and overage pricing.",
    url:
      "https://sendgrid.com/content/dam/sendgrid/global/en/other/sendgrid-pricing/twi121--sendgrid-pricing-pdf-st1.pdf",
  },
  {
    pill: "Official",
    title: "Job Bank Canada",
    description: "Public wage benchmark for call-centre staffing and support cost framing.",
    url: "https://www.jobbank.gc.ca/marketreport/wages-occupation/15201/ca",
  },
  {
    pill: "Official",
    title: "Visa Canada Interchange",
    description: "Published interchange context showing why Brim’s issuer fee is comparatively modest.",
    url: "https://www.visa.ca/en_CA/support/small-business/interchange.html",
  },
  {
    pill: "Official",
    title: "Finance Canada",
    description: "Government benchmark for small-business interchange reductions in Canada.",
    url:
      "https://www.canada.ca/en/department-finance/news/2024/10/government-announces-significant-new-support-to-help-small-business-owners.html",
  },
  {
    pill: "Official",
    title: "Payments Canada",
    description: "Macro payments context for average card transaction size and revolving behavior.",
    url:
      "https://www.newswire.ca/news-releases/canada-reaches-12-2-trillion-in-payment-transactions-in-2024-with-credit-cards-accounting-for-1-in-3-transactions-825863962.html",
  },
  {
    pill: "Official",
    title: "FDIC Credit Card Charge-Offs",
    description: "Public loss-rate context used to test Brim’s portfolio assumptions.",
    url: "https://www.fdic.gov/system/files/2024-07/fdic-v18n1-4q2023.pdf",
  },
];

const benchmarkList = document.getElementById("benchmark-list");
const actionBoard = document.getElementById("action-board");
const sourceGrid = document.getElementById("source-grid");

const benchmarkTag = document.getElementById("benchmark-tag");
const benchmarkDelta = document.getElementById("benchmark-delta");
const benchmarkTitle = document.getElementById("benchmark-title");
const benchmarkDescription = document.getElementById("benchmark-description");
const benchmarkImpact = document.getElementById("benchmark-impact");
const benchmarkAction = document.getElementById("benchmark-action");
const benchmarkSource = document.getElementById("benchmark-source");
const barModel = document.getElementById("bar-model");
const barMarket = document.getElementById("bar-market");
const barModelLabel = document.getElementById("bar-model-label");
const barMarketLabel = document.getElementById("bar-market-label");

const architectureKicker = document.getElementById("architecture-kicker");
const architectureTitle = document.getElementById("architecture-title");
const architectureSummary = document.getElementById("architecture-summary");
const architecturePricing = document.getElementById("architecture-pricing");
const architectureIncluded = document.getElementById("architecture-included");
const architectureExcluded = document.getElementById("architecture-excluded");
const architectureNarrative = document.getElementById("architecture-narrative");
const architectureReaction = document.getElementById("architecture-reaction");

let currentBenchmark = benchmarks[0].id;
let currentArchitecture = "core";
let currentFilter = "all";

function renderBenchmarkList() {
  benchmarkList.innerHTML = "";

  benchmarks.forEach((item) => {
    const button = document.createElement("button");
    button.className = `benchmark-button${item.id === currentBenchmark ? " is-active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="benchmark-button-meta">${item.category}</span>
      <span class="benchmark-button-title">${item.title}</span>
      <span class="benchmark-button-meta">${item.brimLabel} vs ${item.marketLabel}</span>
    `;
    button.addEventListener("click", () => {
      currentBenchmark = item.id;
      renderBenchmarkList();
      renderBenchmarkDetail();
    });
    benchmarkList.appendChild(button);
  });
}

function renderBenchmarkDetail() {
  const item = benchmarks.find((entry) => entry.id === currentBenchmark);
  const max = Math.max(item.brimValue, item.marketValue);
  const modelWidth = `${(item.brimValue / max) * 100}%`;
  const marketWidth = `${(item.marketValue / max) * 100}%`;

  benchmarkTag.textContent = item.category;
  benchmarkDelta.textContent = item.delta;
  benchmarkTitle.textContent = item.title;
  benchmarkDescription.textContent = item.description;
  benchmarkImpact.textContent = item.impact;
  benchmarkAction.textContent = item.action;
  benchmarkSource.textContent = item.sourceLabel;
  benchmarkSource.href = item.sourceUrl;
  barModel.style.width = modelWidth;
  barMarket.style.width = marketWidth;
  barModelLabel.textContent = item.brimLabel;
  barMarketLabel.textContent = item.marketLabel;
}

function fillList(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderArchitecture() {
  const item = architectures[currentArchitecture];
  architectureKicker.textContent = item.kicker;
  architectureTitle.textContent = item.title;
  architectureSummary.textContent = item.summary;
  architectureNarrative.textContent = item.narrative;
  architectureReaction.textContent = item.reaction;
  fillList(architecturePricing, item.pricing);
  fillList(architectureIncluded, item.included);
  fillList(architectureExcluded, item.excluded);

  document.querySelectorAll(".segment-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.architecture === currentArchitecture);
  });
}

function renderActions() {
  actionBoard.innerHTML = "";

  const filtered = currentFilter === "all"
    ? actions
    : actions.filter((item) => item.category === currentFilter);

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "action-card";
    const label = item.category.replace("-", " ");
    card.innerHTML = `
      <div class="action-card-top">
        <span class="action-tag tag-${item.category}">${label}</span>
      </div>
      <h3>${item.title}</h3>
      <p>${item.description}</p>
    `;
    actionBoard.appendChild(card);
  });
}

function renderSources() {
  sourceGrid.innerHTML = "";

  sources.forEach((source) => {
    const card = document.createElement("article");
    card.className = "source-card";
    card.innerHTML = `
      <div class="source-card-top">
        <span class="source-pill tag-defend">${source.pill}</span>
      </div>
      <h3>${source.title}</h3>
      <p>${source.description}</p>
      <a href="${source.url}" target="_blank" rel="noreferrer">Open source</a>
    `;
    sourceGrid.appendChild(card);
  });
}

document.querySelectorAll(".segment-button").forEach((button) => {
  button.addEventListener("click", () => {
    currentArchitecture = button.dataset.architecture;
    renderArchitecture();
  });
});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll(".filter-button").forEach((entry) => {
      entry.classList.toggle("is-active", entry.dataset.filter === currentFilter);
    });
    renderActions();
  });
});

renderBenchmarkList();
renderBenchmarkDetail();
renderArchitecture();
renderActions();
renderSources();
