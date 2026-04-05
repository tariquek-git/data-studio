import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Building2,
  BarChart3,
  Target,
  TrendingUp,
  Database,
  Users,
  MapPin,
  CalendarDays,
  TrendingDown,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

const QUICK_FILTERS = [
  { label: 'Banks over $1B', params: 'min_assets=1000000000&source=fdic' },
  { label: 'Credit Unions', params: 'source=ncua' },
  { label: 'Texas Banks', params: 'states=TX&source=fdic' },
  { label: 'Has Credit Card Program', params: 'has_credit_card_program=true' },
];

const STATIC_STATS = [
  { label: 'Banks', value: '4,700+', icon: Building2 },
  { label: 'Credit Unions', value: '4,700+', icon: Users },
  { label: 'Branches', value: '80,000+', icon: MapPin },
  { label: 'Updated', value: 'Quarterly', icon: CalendarDays },
];

const FEATURES = [
  {
    title: 'Search & Filter',
    description:
      'Find institutions by name, location, size, charter type, and dozens of financial metrics.',
    icon: Search,
  },
  {
    title: 'Financial Analytics',
    description:
      'Explore assets, deposits, loans, capital ratios, and profitability across institutions.',
    icon: BarChart3,
  },
  {
    title: 'Sales Targeting',
    description:
      'Identify banks and credit unions with credit card programs or growth potential.',
    icon: Target,
  },
  {
    title: 'Historical Trends',
    description:
      'Track financial performance over time with quarterly historical data.',
    icon: TrendingUp,
  },
];

const QUICK_SCREENS = [
  { label: 'Community Bank Partners', emoji: '🏦', params: 'min_assets=100000000&max_assets=10000000000&source=fdic&charter_type=commercial' },
  { label: 'Credit Card Targets', emoji: '💳', params: 'has_credit_card_program=true' },
  { label: 'Canadian PSPs', emoji: '🍁', params: 'source=rpaa' },
  { label: 'Top Performers', emoji: '⭐', params: 'min_roa=1.5&source=fdic' },
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
    staleTime: 6 * 60 * 60 * 1000, // 6h
  });

  const snapshot = data?.stat_snapshot;

  const statCards = [
    {
      label: 'Institutions Covered',
      value: snapshot ? snapshot.total_institutions.toLocaleString() : '—',
      icon: Building2,
      color: 'text-primary-600',
      bg: 'bg-primary-50',
    },
    {
      label: 'US Banking Assets',
      value: snapshot ? formatCurrency(snapshot.total_assets_us) : '—',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'CA Banking Assets',
      value: snapshot ? formatCurrency(snapshot.total_assets_ca) : '—',
      icon: Database,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: 'New This Quarter',
      value: snapshot ? snapshot.new_this_quarter.toLocaleString() : '—',
      icon: Sparkles,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ];

  const TABS: { id: ActivityTab; label: string }[] = [
    { id: 'movers', label: 'Movers' },
    { id: 'enforcement', label: 'Regulatory' },
    { id: 'new', label: 'New' },
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-surface-900">What's Happening</h2>
        <p className="mt-1 text-surface-500 text-sm">
          Live activity across U.S. and Canadian financial institutions
        </p>
      </div>

      {/* Stat snapshot cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="flex items-center gap-4">
              <div className={`flex items-center justify-center h-10 w-10 rounded-xl shrink-0 ${card.bg}`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-surface-900 leading-tight">
                  {isLoading ? (
                    <span className="inline-block h-5 w-16 rounded bg-surface-200 animate-pulse" />
                  ) : (
                    card.value
                  )}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">{card.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Activity feed + Quick Screens side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity feed */}
        <Card padding={false} className="lg:col-span-2 overflow-hidden">
          <div className="px-5 pt-5 pb-0">
            <h3 className="text-base font-semibold text-surface-900 mb-4">Recent Activity</h3>
            <div className="flex gap-1 border-b border-surface-200 -mx-5 px-5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-surface-500 hover:text-surface-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-surface-100 min-h-[240px]">
            {isLoading && (
              <div className="p-5 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-5 bg-surface-200 animate-pulse rounded w-full" />
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
                <div className="p-5 text-sm text-surface-400 text-center">No mover data available.</div>
              ) : (
                data?.top_movers.map((m) => {
                  const isPositive = m.asset_change >= 0;
                  return (
                    <div key={m.cert_number} className="flex items-center justify-between px-5 py-3 hover:bg-surface-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {isPositive ? (
                          <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <Link
                            to={`/institution/${m.cert_number}`}
                            className="text-sm font-medium text-primary-700 hover:underline truncate block"
                          >
                            {m.name}
                          </Link>
                          <p className="text-xs text-surface-400">{m.source.toUpperCase()} · {formatCurrency(m.total_assets)}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-mono font-medium shrink-0 ml-3 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{formatCurrency(m.asset_change)} ({isPositive ? '+' : ''}{m.asset_change_pct.toFixed(1)}%)
                      </span>
                    </div>
                  );
                })
              ))}

            {!isLoading && !isError && activeTab === 'enforcement' &&
              (data?.recent_regulatory_events.length === 0 ? (
                <div className="p-5 text-sm text-surface-400 text-center">No recent regulatory events.</div>
              ) : (
                data?.recent_regulatory_events.map((e, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-surface-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        {e.cert_number ? (
                          <Link
                            to={`/institution/${e.cert_number}`}
                            className="text-sm font-medium text-primary-700 hover:underline truncate block"
                          >
                            {e.name}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-surface-900 truncate">{e.name}</p>
                        )}
                        <p className="text-xs text-surface-400">
                          {e.type}{e.details ? ` · ${e.details}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-surface-400 shrink-0 ml-3">
                      {e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </span>
                  </div>
                ))
              ))}

            {!isLoading && !isError && activeTab === 'new' &&
              (data?.new_registrations.length === 0 ? (
                <div className="p-5 text-sm text-surface-400 text-center">No new registrations recently.</div>
              ) : (
                data?.new_registrations.map((r) => (
                  <div key={r.cert_number} className="flex items-center justify-between px-5 py-3 hover:bg-surface-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Sparkles className="h-4 w-4 text-primary-400 shrink-0" />
                      <div className="min-w-0">
                        <Link
                          to={`/institution/${r.cert_number}`}
                          className="text-sm font-medium text-primary-700 hover:underline truncate block"
                        >
                          {r.name}
                        </Link>
                        <p className="text-xs text-surface-400">
                          {r.source.toUpperCase()}{r.charter_type ? ` · ${r.charter_type.replace(/_/g, ' ')}` : ''}{r.city || r.state ? ` · ${[r.city, r.state].filter(Boolean).join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ))}
          </div>
        </Card>

        {/* Quick Screens */}
        <Card>
          <h3 className="text-base font-semibold text-surface-900 mb-4">Quick Screens</h3>
          <div className="space-y-2">
            {QUICK_SCREENS.map((screen) => (
              <Link
                key={screen.label}
                to={`/search?${screen.params}`}
                className="flex items-center gap-3 px-3 py-3 rounded-lg border border-surface-200 hover:border-primary-300 hover:bg-primary-50/50 transition-colors group"
              >
                <span className="text-xl leading-none">{screen.emoji}</span>
                <span className="text-sm font-medium text-surface-700 group-hover:text-primary-700">
                  {screen.label}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/search');
    }
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-sm mb-6">
            <Database className="h-4 w-4" />
            Powered by FDIC, NCUA, OSFI, and Bank of Canada data
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            Explore U.S. &amp; Canadian
            <br className="hidden sm:block" />
            Financial Institutions
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-primary-100 max-w-2xl mx-auto">
            Search regulatory data from FDIC, NCUA, OSFI, and more. Analyze financials, discover
            trends, and target opportunities.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="mt-10 max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search banks, credit unions, holding companies..."
                className="w-full pl-12 pr-28 py-4 rounded-xl bg-white text-surface-900 text-base placeholder:text-surface-400 shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick filters */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {QUICK_FILTERS.map((chip) => (
              <Link
                key={chip.label}
                to={`/search?${chip.params}`}
                className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur text-sm font-medium text-white hover:bg-white/20 transition-colors"
              >
                {chip.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Static stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATIC_STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="text-center">
                <Icon className="h-6 w-6 text-primary-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-surface-900">{stat.value}</p>
                <p className="text-sm text-surface-500">{stat.label}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Discovery section */}
      <DiscoverySection />

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-surface-900">
            Everything you need to research financial institutions
          </h2>
          <p className="mt-3 text-lg text-surface-500">
            Comprehensive data, powerful filters, and actionable insights.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title}>
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary-50 mb-4">
                  <Icon className="h-5 w-5 text-primary-600" />
                </div>
                <h3 className="text-base font-semibold text-surface-900">{feature.title}</h3>
                <p className="mt-1 text-sm text-surface-500">{feature.description}</p>
              </Card>
            );
          })}
        </div>
        <div className="mt-10 text-center">
          <Link to="/search">
            <Button size="lg">Start Exploring</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
