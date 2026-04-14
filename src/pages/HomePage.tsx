import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { PhysicsHero } from '@/components/physics/PhysicsHero';

const FEATURES = [
  {
    title: 'Search & Filter',
    description: 'Find institutions by name, location, size, charter type, and dozens of financial metrics.',
    icon: Search,
    accent: 'text-primary-400 bg-primary-500/10',
  },
  {
    title: 'Relationship Graph',
    description: 'Explore 9,300+ entity relationships — holding companies, regulators, and affiliates.',
    icon: Network,
    accent: 'text-violet-600 bg-violet-50',
  },
  {
    title: 'BD Intelligence',
    description: 'Identify migration targets, credit card prospects, and high-value opportunities with Brim scoring.',
    icon: Target,
    accent: 'text-emerald-600 bg-emerald-50',
  },
  {
    title: 'Compliance & Audit',
    description: 'Track provenance, data freshness, and regulatory source coverage across 10+ agencies.',
    icon: ShieldCheck,
    accent: 'text-amber-600 bg-amber-50',
  },
];

const QUICK_SCREENS = [
  { label: 'Community Bank Partners', params: 'min_assets=100000000&max_assets=10000000000&source=fdic&charter_type=commercial' },
  { label: 'Credit Card Targets', params: 'has_credit_card_program=true' },
  { label: 'Canadian PSPs', params: 'source=rpaa' },
  { label: 'Top Performers', params: 'min_roa=1.5&source=fdic' },
];

interface DiscoveryData {
  top_movers: Array<{
    cert_number: number;
    name: string;
    source: string;
    asset_change: number;
    asset_change_pct: number;
    total_assets: number;
  }>;
  recent_regulatory_events: Array<{
    cert_number: number | null;
    name: string;
    date: string;
    type: string;
    details: string | null;
  }>;
  new_registrations: Array<{
    cert_number: number;
    name: string;
    source: string;
    charter_type: string | null;
    city: string | null;
    state: string | null;
  }>;
  stat_snapshot: {
    total_institutions: number;
    total_assets_us: number;
    total_assets_ca: number;
    new_this_quarter: number;
  };
}

async function fetchDiscovery(): Promise<DiscoveryData> {
  const res = await fetch('/api/analytics/discovery');
  if (!res.ok) throw new Error('Failed to fetch discovery data');
  return res.json();
}

type ActivityTab = 'movers' | 'enforcement' | 'new';

function DiscoverySection() {
  const [activeTab, setActiveTab] = useState<ActivityTab>('movers');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['discovery'],
    queryFn: fetchDiscovery,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const snapshot = data?.stat_snapshot;

  const statCards = [
    { label: 'Institutions', value: snapshot ? snapshot.total_institutions.toLocaleString() : '--', accent: 'text-primary-400', border: 'border-primary-500/20' },
    { label: 'US Assets', value: snapshot ? formatCurrency(snapshot.total_assets_us) : '--', accent: 'text-emerald-600', border: 'border-emerald-200' },
    { label: 'CA Assets', value: snapshot ? formatCurrency(snapshot.total_assets_ca) : '--', accent: 'text-cyan-600', border: 'border-cyan-200' },
    { label: 'New This Quarter', value: snapshot ? snapshot.new_this_quarter.toLocaleString() : '--', accent: 'text-amber-600', border: 'border-amber-200' },
  ];

  const TABS: { id: ActivityTab; label: string }[] = [
    { id: 'movers', label: 'Movers' },
    { id: 'enforcement', label: 'Regulatory' },
    { id: 'new', label: 'New' },
  ];

  return (
    <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-surface-100">Live Intelligence</h2>
        <p className="mt-1 text-surface-400 text-sm">
          Real-time activity across U.S. and Canadian financial institutions
        </p>
      </div>

      {/* Stat snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={card.label} className={`glass-card p-5 border ${card.border} animate-fade-in-up`} style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'both' }}>
            <p className={`text-2xl font-bold font-mono ${card.accent}`}>
              {isLoading ? (
                <span className="inline-block h-7 w-20 rounded bg-surface-700 animate-pulse" />
              ) : (
                card.value
              )}
            </p>
            <p className="text-xs text-surface-400 mt-1 uppercase tracking-wider">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Activity feed + Quick Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity feed */}
        <div className="glass-card lg:col-span-2 overflow-hidden">
          <div className="px-5 pt-5 pb-0">
            <h3 className="text-sm font-semibold text-surface-200 mb-4">Recent Activity</h3>
            <div className="flex gap-1 border-b border-surface-700/50 -mx-5 px-5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab.id
                      ? 'border-primary-400 text-primary-300'
                      : 'border-transparent text-surface-500 hover:text-surface-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-surface-700/30 min-h-[240px]">
            {isLoading && (
              <div className="p-5 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-5 bg-surface-700 animate-pulse rounded w-full" />
                ))}
              </div>
            )}

            {isError && (
              <div className="p-5 text-sm text-surface-500 text-center">
                Unable to load activity feed right now.
              </div>
            )}

            {!isLoading && !isError && activeTab === 'movers' &&
              (data?.top_movers.length === 0 ? (
                <div className="p-8 text-center">
                    <TrendingUp className="h-6 w-6 text-surface-600 mx-auto mb-2" />
                    <p className="text-sm text-surface-500">No mover data available yet.</p>
                  </div>
              ) : (
                data?.top_movers.map((m) => {
                  const isPositive = m.asset_change >= 0;
                  return (
                    <div key={m.cert_number} className="flex items-center justify-between px-5 py-3 hover:bg-surface-700/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {isPositive ? (
                          <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <Link
                            to={`/institution/${m.cert_number}`}
                            className="text-sm font-medium text-surface-200 hover:text-primary-300 truncate block transition-colors"
                          >
                            {m.name}
                          </Link>
                          <p className="text-xs text-surface-500">{m.source.toUpperCase()} · {formatCurrency(m.total_assets)}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-mono font-medium shrink-0 ml-3 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{formatCurrency(m.asset_change)} ({isPositive ? '+' : ''}{m.asset_change_pct.toFixed(1)}%)
                      </span>
                    </div>
                  );
                })
              ))}

            {!isLoading && !isError && activeTab === 'enforcement' &&
              (data?.recent_regulatory_events.length === 0 ? (
                <div className="p-8 text-center">
                    <AlertTriangle className="h-6 w-6 text-surface-600 mx-auto mb-2" />
                    <p className="text-sm text-surface-500">No recent regulatory events.</p>
                  </div>
              ) : (
                data?.recent_regulatory_events.map((e, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-surface-700/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        {e.cert_number ? (
                          <Link
                            to={`/institution/${e.cert_number}`}
                            className="text-sm font-medium text-surface-200 hover:text-primary-300 truncate block transition-colors"
                          >
                            {e.name}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-surface-200 truncate">{e.name}</p>
                        )}
                        <p className="text-xs text-surface-500">
                          {e.type}{e.details ? ` · ${e.details}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-surface-500 shrink-0 ml-3">
                      {e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </span>
                  </div>
                ))
              ))}

            {!isLoading && !isError && activeTab === 'new' &&
              (data?.new_registrations.length === 0 ? (
                <div className="p-8 text-center">
                    <Sparkles className="h-6 w-6 text-surface-600 mx-auto mb-2" />
                    <p className="text-sm text-surface-500">No new registrations recently.</p>
                  </div>
              ) : (
                data?.new_registrations.map((r) => (
                  <div key={r.cert_number} className="flex items-center justify-between px-5 py-3 hover:bg-surface-700/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Sparkles className="h-4 w-4 text-primary-400 shrink-0" />
                      <div className="min-w-0">
                        <Link
                          to={`/institution/${r.cert_number}`}
                          className="text-sm font-medium text-surface-200 hover:text-primary-300 truncate block transition-colors"
                        >
                          {r.name}
                        </Link>
                        <p className="text-xs text-surface-500">
                          {r.source.toUpperCase()}{r.charter_type ? ` · ${r.charter_type.replace(/_/g, ' ')}` : ''}{r.city || r.state ? ` · ${[r.city, r.state].filter(Boolean).join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ))}
          </div>
        </div>

        {/* Quick Screens */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-surface-200 mb-4">Quick Screens</h3>
          <div className="space-y-2">
            {QUICK_SCREENS.map((screen) => (
              <Link
                key={screen.label}
                to={`/explore?${screen.params}`}
                className="flex items-center justify-between px-3 py-3 rounded-lg border border-surface-700/50 hover:border-primary-500/30 hover:bg-primary-500/5 transition-all group card-hover-lift"
              >
                <span className="text-sm font-medium text-surface-300 group-hover:text-primary-300">
                  {screen.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-surface-600 group-hover:text-primary-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div>
      {/* Physics hero — full viewport */}
      <PhysicsHero />

      {/* Discovery section */}
      <DiscoverySection />

      {/* Features */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-surface-100">
            Built for financial intelligence
          </h2>
          <p className="mt-2 text-surface-400">
            Comprehensive data, powerful filters, and actionable insights.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const [iconColor, iconBg] = feature.accent.split(' ');
            return (
              <div key={feature.title} className="glass-card card-hover-lift p-5 transition-all cursor-default">
                <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${iconBg} mb-4`}>
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <h3 className="text-sm font-semibold text-surface-100">{feature.title}</h3>
                <p className="mt-1 text-xs text-surface-400 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-400 transition-colors shadow-sm shadow-primary-500/20"
          >
            Start Exploring
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
