// Shapes the API returns. Amounts are decimal strings of 18-decimal integers; parse with BigInt().

export type Outcomes = { valid: number; mistake: number; slop: number; refunded: number };

export type PoolView = {
  id: number;
  repoId: string;
  repoName: string | null;
  creator: string;
  verdictSigner: string;
  depositAmount: string;
  timeout: number;
  maxPayout: string;
  fundedBalance: string;
  slashedBalance: string;
  available: string;
  openReports: number;
  createdAt: number;
  createdTx: string;
  outcomes: Outcomes;
};

export type TimelineEntryView = {
  kind: string;
  tx: string;
  block: number;
  time: number;
  amount?: string;
  status?: number;
};

export type ReportView = {
  id: number;
  poolId: number;
  repoName: string | null;
  reporter: string;
  deposit: string;
  createdAt: number;
  deadline: number;
  status: number;
  bounty: string;
  advisoryHash: string;
  hasAdvisoryLink: boolean;
  timeline: TimelineEntryView[];
};

export type StatusView = {
  network: string;
  chainId: number;
  deployed: boolean;
  contract: string;
  lastBlock: number;
  storage: "postgres" | "files";
};
