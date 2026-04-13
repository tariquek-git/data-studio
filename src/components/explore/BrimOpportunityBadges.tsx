import type { Institution } from '@/types/institution';

const MIGRATION_PROGRAMS = ['ELAN', 'TCM', 'ICBA', 'PSCU', 'FIS', 'TOTAL SYSTEM'];

interface OpportunityBadge {
  label: string;
  color: string;
}

export function getBrimOpportunityBadges(inst: Institution): OpportunityBadge[] {
  const badges: OpportunityBadge[] = [];

  const agentProgram = inst.agent_bank_program?.toUpperCase() ?? '';
  const isMigrationTarget = MIGRATION_PROGRAMS.some((p) => agentProgram.includes(p));

  if (isMigrationTarget) {
    badges.push({ label: 'Migration Target', color: 'amber' });
  }

  const hasCards = (inst.credit_card_loans ?? 0) > 0 || inst.issues_credit_cards === true;
  const hasNoAgentProgram = !inst.agent_bank_program || inst.agent_bank_program.trim() === '';

  if (hasCards && hasNoAgentProgram && !isMigrationTarget) {
    badges.push({ label: 'In-House Candidate', color: 'green' });
  }

  const assetSize = inst.total_assets ?? 0;
  const roa = inst.roa ?? 0;
  const isSweetSpot =
    assetSize >= 500_000_000 &&
    assetSize <= 20_000_000_000 &&
    roa > 1.0 &&
    hasCards;

  if (isSweetSpot) {
    badges.push({ label: 'Sweet Spot', color: 'violet' });
  }

  return badges;
}

const COLOR_CLASSES: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
};

interface BrimOpportunityBadgesProps {
  institution: Institution;
}

export function BrimOpportunityBadges({ institution }: BrimOpportunityBadgesProps) {
  const badges = getBrimOpportunityBadges(institution);

  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${COLOR_CLASSES[badge.color] ?? COLOR_CLASSES.blue}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
