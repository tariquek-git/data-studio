import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
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
} from 'lucide-react';
import { Card, Button } from '@/components/ui';

const QUICK_FILTERS = [
  { label: 'Banks over $1B', params: 'min_assets=1000000000&source=fdic' },
  { label: 'Credit Unions', params: 'source=ncua' },
  { label: 'Texas Banks', params: 'states=TX&source=fdic' },
  { label: 'Has Credit Card Program', params: 'has_credit_card_program=true' },
];

const STATS = [
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

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((stat) => {
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
