import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export type SourceSyncRequirementType = 'env' | 'file' | 'credential' | 'manual';

export interface SourceSyncRequirementStatus {
  code: string;
  label: string;
  type: SourceSyncRequirementType;
  ready: boolean;
  optional: boolean;
  docs_url: string | null;
}

export interface SourceSyncStatus {
  source_key: string;
  supported: boolean;
  ready: boolean;
  endpoint: string | null;
  execution_kind: 'script' | 'native' | null;
  script_path: string | null;
  supports_dry_run: boolean;
  requirements: SourceSyncRequirementStatus[];
  notes: string[];
}

export interface SourceSyncExecutionResult {
  source_key: string;
  dry_run: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
}

type SourceSyncDefinition = {
  sourceKey: string;
  scriptPath: string | null;
  supportsDryRun?: boolean;
  docsUrls?: string[];
  notes?: string[];
  requirements: (env: Record<string, string>) => SourceSyncRequirementStatus[];
};

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const ENV_LOCAL_PATH = join(PROJECT_ROOT, '.env.local');

function loadLocalEnv() {
  if (!existsSync(ENV_LOCAL_PATH)) return {};

  const env: Record<string, string> = {};
  const envContent = readFileSync(ENV_LOCAL_PATH, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }

  return env;
}

function mergedEnv() {
  return {
    ...loadLocalEnv(),
    ...Object.fromEntries(
      Object.entries(process.env).flatMap(([key, value]) => (value == null ? [] : [[key, String(value)]]))
    ),
  };
}

function envRequirement(
  env: Record<string, string>,
  key: string,
  label: string,
  docsUrl: string | null,
  optional = false
): SourceSyncRequirementStatus {
  return {
    code: key,
    label,
    type: 'env',
    ready: Boolean(env[key]),
    optional,
    docs_url: docsUrl,
  };
}

function fileRequirement(
  env: Record<string, string>,
  key: string,
  label: string,
  docsUrl: string | null,
  optional = false
): SourceSyncRequirementStatus {
  const filePath = env[key];
  return {
    code: key,
    label,
    type: 'file',
    ready: Boolean(filePath && existsSync(filePath)),
    optional,
    docs_url: docsUrl,
  };
}

function oneOfRequirement(
  code: string,
  label: string,
  docsUrl: string | null,
  statuses: SourceSyncRequirementStatus[],
  type: SourceSyncRequirementType = 'credential'
): SourceSyncRequirementStatus {
  return {
    code,
    label,
    type,
    ready: statuses.some((status) => status.ready),
    optional: false,
    docs_url: docsUrl,
  };
}

const SOURCE_SYNC_DEFINITIONS: SourceSyncDefinition[] = [
  {
    sourceKey: 'fdic',
    scriptPath: 'scripts/sync-fdic.mjs',
    docsUrls: ['https://banks.data.fdic.gov/docs/'],
    notes: ['Live loader for FDIC institutions and current-quarter financial history.'],
    requirements: () => [],
  },
  {
    sourceKey: 'fdic_history',
    scriptPath: 'scripts/sync-fdic-history.mjs',
    supportsDryRun: true,
    docsUrls: ['https://api.fdic.gov/banks/history'],
    notes: ['Loads institution-level FDIC history events into charter_events and filters out branch rows.'],
    requirements: () => [],
  },
  {
    sourceKey: 'ncua',
    scriptPath: 'scripts/sync-ncua.mjs',
    docsUrls: ['https://www.ncua.gov/analysis/credit-union-corporate-call-report-data'],
    notes: ['Pulls the official quarterly federally insured credit union list and call-report fields.'],
    requirements: () => [],
  },
  {
    sourceKey: 'osfi',
    scriptPath: 'scripts/sync-osfi.mjs',
    docsUrls: ['https://open.canada.ca/data/en/dataset/b27ec3ef-7338-4e76-a6fd-128339a92df5'],
    notes: ['Loads OSFI Who We Regulate coverage for Canadian federally regulated institutions.'],
    requirements: () => [],
  },
  {
    sourceKey: 'rpaa',
    scriptPath: 'scripts/sync-rpaa.mjs',
    docsUrls: [
      'https://www.bankofcanada.ca/core-functions/retail-payments-supervision/psp-registry/',
      'https://www.bankofcanada.ca/rps-api/cif2/accounts/list',
    ],
    notes: ['Loads the Bank of Canada RPAA PSP registry.'],
    requirements: () => [],
  },
  {
    sourceKey: 'boc',
    scriptPath: 'scripts/sync-boc-series.mjs',
    docsUrls: ['https://www.bankofcanada.ca/valet/docs'],
    notes: ['Loads Bank of Canada policy-rate and macro context series into macro_series.'],
    requirements: () => [],
  },
  {
    sourceKey: 'ciro',
    scriptPath: 'scripts/sync-ciro.mjs',
    docsUrls: ['https://www.ciro.ca/investors/check-your-advisor-dealer'],
    notes: ['Currently uses the curated CIRO member seed because CIRO blocks automated fetches.'],
    requirements: () => [],
  },
  {
    sourceKey: 'fintrac',
    scriptPath: 'scripts/sync-fintrac.mjs',
    docsUrls: ['https://www10.fintrac-canafe.gc.ca/msb-esm/public/msb-list/'],
    notes: ['Loads FINTRAC MSBs and the starter FinCEN subset exposed by the same script.'],
    requirements: () => [],
  },
  {
    sourceKey: 'fincen',
    scriptPath: 'scripts/sync-fintrac.mjs',
    docsUrls: ['https://www.fincen.gov/msb-registrant-search'],
    notes: ['Uses the shared MSB loader path that currently includes the starter FinCEN subset.'],
    requirements: () => [],
  },
  {
    sourceKey: 'occ',
    scriptPath: 'scripts/sync-occ.mjs',
    supportsDryRun: true,
    docsUrls: ['https://www.occ.treas.gov/topics/charters-and-licensing/financial-institution-lists/index-financial-institution-lists.html'],
    notes: ['Requires institutions_source_check to allow occ before live upserts succeed.'],
    requirements: () => [],
  },
  {
    sourceKey: 'ffiec_cdr',
    scriptPath: 'scripts/sync-ffiec-cdr.mjs',
    docsUrls: [
      'https://cdr.ffiec.gov/public/HelpFiles/PWSInfo.htm',
      'https://cdr.ffiec.gov/public/Files/SIS611_-_Retrieve_Public_Data_via_Web_Service.pdf',
    ],
    notes: ['Starter loader enriches RSSD, routing, OCC charter, and filing-status metadata from the Panel of Reporters.'],
    requirements: (env) => {
      const panelFile = fileRequirement(
        env,
        'FFIEC_CDR_PANEL_FILE',
        'Local FFIEC CDR panel JSON file',
        'https://cdr.ffiec.gov/public/Files/SIS611_-_Retrieve_Public_Data_via_Web_Service.pdf',
        true
      );
      const userId = envRequirement(
        env,
        'FFIEC_CDR_USER_ID',
        'FFIEC CDR PWS User ID',
        'https://cdr.ffiec.gov/public/HelpFiles/PWSInfo.htm',
        true
      );
      const authToken = envRequirement(
        env,
        'FFIEC_CDR_AUTH_TOKEN',
        'FFIEC CDR PWS auth token',
        'https://cdr.ffiec.gov/public/HelpFiles/PWSInfo.htm',
        true
      );

      return [
        oneOfRequirement(
          'ffiec_cdr_access',
          'Either a local FFIEC panel file or live PWS credentials',
          'https://cdr.ffiec.gov/public/HelpFiles/PWSInfo.htm',
          [panelFile, { ...userId, ready: userId.ready && authToken.ready }]
        ),
        panelFile,
        userId,
        authToken,
      ];
    },
  },
  {
    sourceKey: 'ffiec_nic',
    scriptPath: 'scripts/sync-ffiec-nic.mjs',
    docsUrls: [
      'https://www.ffiec.gov/npw/FinancialReport/DataDownload',
      'https://www.ffiec.gov/npw/StaticData/DataDownload/NPW%20Data%20Dictionary.pdf',
    ],
    notes: ['NIC bulk download still requires manual file download because the official site is CAPTCHA-protected.'],
    requirements: (env) => [
      fileRequirement(
        env,
        'FFIEC_NIC_ACTIVE_FILE',
        'NIC attributes-active CSV ZIP file',
        'https://www.ffiec.gov/npw/FinancialReport/DataDownload'
      ),
      fileRequirement(
        env,
        'FFIEC_NIC_RELATIONSHIPS_FILE',
        'NIC relationships CSV ZIP file',
        'https://www.ffiec.gov/npw/FinancialReport/DataDownload',
        true
      ),
      fileRequirement(
        env,
        'FFIEC_NIC_TRANSFORMATIONS_FILE',
        'NIC transformations CSV ZIP file',
        'https://www.ffiec.gov/npw/FinancialReport/DataDownload',
        true
      ),
    ],
  },
  {
    sourceKey: 'cfpb_complaints',
    scriptPath: 'scripts/sync-cfpb-complaints.mjs',
    supportsDryRun: true,
    docsUrls: [
      'https://www.consumerfinance.gov/data-research/consumer-complaints/',
      'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/',
    ],
    notes: ['Uses the official CFPB complaints search and trends APIs to load practical complaint signals.'],
    requirements: () => [],
  },
];

const DEFINITIONS_BY_KEY = new Map(SOURCE_SYNC_DEFINITIONS.map((definition) => [definition.sourceKey, definition]));

export function listSourceSyncStatuses() {
  const env = mergedEnv();
  return SOURCE_SYNC_DEFINITIONS.map((definition) => buildSourceSyncStatus(definition, env));
}

export function getSourceSyncStatus(sourceKey: string) {
  const definition = DEFINITIONS_BY_KEY.get(sourceKey);
  if (!definition) return null;
  return buildSourceSyncStatus(definition, mergedEnv());
}

export function hasSourceSync(sourceKey: string) {
  return DEFINITIONS_BY_KEY.has(sourceKey);
}

function buildSourceSyncStatus(definition: SourceSyncDefinition, env: Record<string, string>): SourceSyncStatus {
  const requirements = definition.requirements(env);
  const blockingRequirements = requirements.filter((requirement) => !requirement.optional && !requirement.ready);

  return {
    source_key: definition.sourceKey,
    supported: Boolean(definition.scriptPath),
    ready: blockingRequirements.length === 0,
    endpoint: `/api/sync/${definition.sourceKey}`,
    execution_kind: definition.scriptPath ? 'script' : null,
    script_path: definition.scriptPath,
    supports_dry_run: Boolean(definition.supportsDryRun),
    requirements,
    notes: definition.notes ?? [],
  };
}

export async function runSourceSync(sourceKey: string, options: { dryRun?: boolean } = {}): Promise<SourceSyncExecutionResult> {
  const definition = DEFINITIONS_BY_KEY.get(sourceKey);
  if (!definition || !definition.scriptPath) {
    throw new Error(`No sync definition registered for ${sourceKey}`);
  }

  const args = [definition.scriptPath];
  const enableDryRun = Boolean(options.dryRun && definition.supportsDryRun);
  const env = {
    ...process.env,
    ...(enableDryRun ? { DRY_RUN: '1' } : {}),
  };

  try {
    const { stdout, stderr } = await execFileAsync('node', args, {
      cwd: PROJECT_ROOT,
      env,
      maxBuffer: 16 * 1024 * 1024,
    });

    return {
      source_key: sourceKey,
      dry_run: enableDryRun,
      command: `node ${definition.scriptPath}`,
      stdout,
      stderr,
      exit_code: 0,
    };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };

    return {
      source_key: sourceKey,
      dry_run: enableDryRun,
      command: `node ${definition.scriptPath}`,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? 'Unknown sync failure',
      exit_code: typeof failure.code === 'number' ? failure.code : 1,
    };
  }
}
