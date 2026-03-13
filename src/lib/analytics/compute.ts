/**
 * Analytics Compute Library — Phase 7 Wave A1
 *
 * Pure functions for computing analytics snapshots.
 * No side effects, no Supabase calls. Used by both the Inngest nightly
 * cron and on-demand API routes.
 */

// ── Input Types ──────────────────────────────────────────────

export type RawApplication = {
  id: string;
  job_opening_id: string;
  candidate_id: string;
  status: string;
  current_stage_id: string | null;
  applied_at: string;
  hired_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
};

export type RawStageHistoryRow = {
  id: string;
  application_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  created_at: string;
};

export type RawStage = {
  id: string;
  name: string;
  stage_type: string;
  stage_order: number;
  pipeline_template_id: string;
};

export type RawJob = {
  id: string;
  title: string;
  department: string | null;
  status: string;
  recruiter_id: string | null;
  published_at: string | null;
  created_at: string;
};

export type RawCandidate = {
  id: string;
  source: string | null;
  source_id: string | null;
};

export type RawCandidateSource = {
  id: string;
  name: string;
};

export type RawInterview = {
  id: string;
  application_id: string;
  job_opening_id: string;
  interviewer_id: string;
  status: string;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type RawScorecardSubmission = {
  id: string;
  interview_id: string;
  application_id: string;
  submitted_by: string;
  created_at: string;
};

export type RawUserProfile = {
  id: string;
  full_name: string;
};

export type RawOffer = {
  id: string;
  application_id: string;
  job_opening_id: string;
  status: string;
  created_at: string;
};

// ── Output Types (JSONB snapshot schemas) ────────────────────

export type FunnelStageSnapshot = {
  stageId: string;
  stageName: string;
  stageType: string;
  count: number;
  enteredCount: number;
  exitedCount: number;
  conversionRate: number;
  avgDaysInStage: number;
};

export type FunnelSnapshot = {
  period: string;
  totalApplications: number;
  activeApplications: number;
  stages: FunnelStageSnapshot[];
  overallConversionRate: number;
  hiredCount: number;
};

export type StageVelocity = {
  stageName: string;
  avgDays: number;
  p75Days: number;
  p90Days: number;
};

export type VelocitySnapshot = {
  period: string;
  avgTimeToHireDays: number | null;
  medianTimeToHireDays: number | null;
  avgTimeToFillDays: number | null;
  stageVelocity: StageVelocity[];
  bottleneckStage: string | null;
  openJobsAtRisk: number;
};

export type SourceMetric = {
  sourceName: string;
  applicationCount: number;
  shortlistRate: number;
  hireRate: number;
  avgTimeToHireDays: number | null;
  qualityScore: number;
};

export type SourceSnapshot = {
  period: string;
  sources: SourceMetric[];
};

export type RecruiterMetric = {
  userId: string;
  name: string;
  openJobCount: number;
  activePipelineCount: number;
  avgStageVelocityDays: number | null;
  hiredThisMonth: number;
  feedbackComplianceRate: number;
};

export type InterviewerMetric = {
  userId: string;
  name: string;
  scheduledCount: number;
  completedCount: number;
  overdueCount: number;
  avgFeedbackTurnaroundHours: number | null;
};

export type TeamSnapshot = {
  period: string;
  recruiters: RecruiterMetric[];
  interviewers: InterviewerMetric[];
};

export type JobMetric = {
  jobId: string;
  title: string;
  department: string | null;
  daysOpen: number;
  applicationCount: number;
  activeCount: number;
  shortlistCount: number;
  interviewCount: number;
  offerCount: number;
  conversionRate: number;
  healthScore: number;
  predictedFillDays: number | null;
};

export type JobSnapshot = {
  period: string;
  jobs: JobMetric[];
};

export type DateRange = { from: Date; to: Date };

// ── Helpers ──────────────────────────────────────────────────

function inRange(dateStr: string, range: DateRange): boolean {
  const d = new Date(dateStr);
  return d >= range.from && d <= range.to;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Funnel Analytics ─────────────────────────────────────────

export function computeFunnelAnalytics(params: {
  applications: RawApplication[];
  stageHistory: RawStageHistoryRow[];
  stages: RawStage[];
  dateRange: DateRange;
}): FunnelSnapshot {
  const { applications, stageHistory, stages, dateRange } = params;

  // Filter applications in range
  const appsInRange = applications.filter((a) => inRange(a.applied_at, dateRange));
  const appIds = new Set(appsInRange.map((a) => a.id));

  // Filter stage history to relevant applications and date range
  const historyInRange = stageHistory.filter(
    (h) => appIds.has(h.application_id) && inRange(h.created_at, dateRange)
  );

  // Sort stages by order
  const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order);

  const stageSnapshots: FunnelStageSnapshot[] = sortedStages.map((stage) => {
    // Entries: unique applications that entered this stage
    const entered = new Set(
      historyInRange
        .filter((h) => h.to_stage_id === stage.id)
        .map((h) => h.application_id)
    );

    // Exits: unique applications that left this stage
    const exited = new Set(
      historyInRange
        .filter((h) => h.from_stage_id === stage.id)
        .map((h) => h.application_id)
    );

    // Currently sitting in this stage
    const currentCount = appsInRange.filter(
      (a) => a.current_stage_id === stage.id && a.status === "active"
    ).length;

    // Time in stage: for each app that entered and exited, compute duration
    const durations: number[] = [];
    for (const appId of entered) {
      const enterEvent = historyInRange
        .filter((h) => h.application_id === appId && h.to_stage_id === stage.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      const exitEvent = historyInRange
        .filter((h) => h.application_id === appId && h.from_stage_id === stage.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (enterEvent && exitEvent) {
        durations.push(daysBetween(enterEvent.created_at, exitEvent.created_at));
      }
    }

    const avgDays = durations.length > 0
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : 0;

    return {
      stageId: stage.id,
      stageName: stage.name,
      stageType: stage.stage_type,
      count: currentCount,
      enteredCount: entered.size,
      exitedCount: exited.size,
      conversionRate: entered.size > 0 ? round1(exited.size / entered.size) : 0,
      avgDaysInStage: round1(avgDays),
    };
  });

  const totalApps = appsInRange.length;
  const activeApps = appsInRange.filter((a) => a.status === "active").length;
  const hiredCount = appsInRange.filter((a) => a.status === "hired").length;

  return {
    period: dateRange.from.toISOString().slice(0, 10),
    totalApplications: totalApps,
    activeApplications: activeApps,
    stages: stageSnapshots,
    overallConversionRate: totalApps > 0 ? round1(hiredCount / totalApps) : 0,
    hiredCount,
  };
}

// ── Velocity Analytics ───────────────────────────────────────

export function computeVelocityAnalytics(params: {
  applications: RawApplication[];
  stageHistory: RawStageHistoryRow[];
  stages: RawStage[];
  jobs: RawJob[];
  dateRange: DateRange;
}): VelocitySnapshot {
  const { applications, stageHistory, stages, jobs, dateRange } = params;

  // Time to hire: only hired applications in range
  const hiredApps = applications.filter(
    (a) => a.status === "hired" && a.hired_at && inRange(a.hired_at, dateRange)
  );
  const hireDays = hiredApps
    .map((a) => daysBetween(a.applied_at, a.hired_at!))
    .sort((a, b) => a - b);

  const avgTimeToHire = hireDays.length > 0
    ? round1(hireDays.reduce((s, d) => s + d, 0) / hireDays.length)
    : null;
  const medianTimeToHire = hireDays.length > 0 ? round1(median(hireDays)!) : null;

  // Time to fill: days from job published_at to first hire
  const openJobs = jobs.filter((j) => j.status === "open");
  const fillDays: number[] = [];
  for (const job of jobs) {
    const pubDate = job.published_at ?? job.created_at;
    const firstHire = applications
      .filter((a) => a.job_opening_id === job.id && a.status === "hired" && a.hired_at)
      .sort((a, b) => a.hired_at!.localeCompare(b.hired_at!))[0];
    if (firstHire) {
      fillDays.push(daysBetween(pubDate, firstHire.hired_at!));
    }
  }
  const avgTimeToFill = fillDays.length > 0
    ? round1(fillDays.reduce((s, d) => s + d, 0) / fillDays.length)
    : null;

  // Stage velocity
  const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  const appIds = new Set(applications.map((a) => a.id));
  const relevantHistory = stageHistory.filter((h) => appIds.has(h.application_id));

  const stageVelocity: StageVelocity[] = sortedStages.map((stage) => {
    const durations: number[] = [];
    const enteredApps = relevantHistory.filter((h) => h.to_stage_id === stage.id);

    for (const enter of enteredApps) {
      const exit = relevantHistory.find(
        (h) => h.application_id === enter.application_id && h.from_stage_id === stage.id &&
          h.created_at >= enter.created_at
      );
      if (exit) {
        durations.push(daysBetween(enter.created_at, exit.created_at));
      }
    }

    const sorted = durations.sort((a, b) => a - b);

    return {
      stageName: stage.name,
      avgDays: sorted.length > 0
        ? round1(sorted.reduce((s, d) => s + d, 0) / sorted.length)
        : 0,
      p75Days: round1(percentile(sorted, 75)),
      p90Days: round1(percentile(sorted, 90)),
    };
  });

  const bottleneck = stageVelocity.length > 0
    ? stageVelocity.reduce((max, s) => (s.avgDays > max.avgDays ? s : max)).stageName
    : null;

  // At-risk: open ≥21 days with <3 active apps
  const nowMs = Date.now();
  const atRiskCount = openJobs.filter((job) => {
    const pubDate = job.published_at ?? job.created_at;
    const daysOpen = (nowMs - new Date(pubDate).getTime()) / 86400000;
    const activeCount = applications.filter(
      (a) => a.job_opening_id === job.id && a.status === "active"
    ).length;
    return daysOpen >= 21 && activeCount < 3;
  }).length;

  return {
    period: dateRange.from.toISOString().slice(0, 10),
    avgTimeToHireDays: avgTimeToHire,
    medianTimeToHireDays: medianTimeToHire,
    avgTimeToFillDays: avgTimeToFill,
    stageVelocity,
    bottleneckStage: bottleneck !== null && stageVelocity.find((s) => s.stageName === bottleneck)?.avgDays === 0
      ? null
      : bottleneck,
    openJobsAtRisk: atRiskCount,
  };
}

// ── Source Analytics ──────────────────────────────────────────

export function computeSourceAnalytics(params: {
  applications: RawApplication[];
  candidates: RawCandidate[];
  sources: RawCandidateSource[];
  dateRange: DateRange;
}): SourceSnapshot {
  const { applications, candidates, sources, dateRange } = params;

  // Build source name lookup
  const sourceNameById: Record<string, string> = {};
  for (const s of sources) sourceNameById[s.id] = s.name;

  // Build candidate source lookup
  const candidateSource: Record<string, string> = {};
  for (const c of candidates) {
    candidateSource[c.id] = c.source_id
      ? (sourceNameById[c.source_id] ?? c.source ?? "Unknown")
      : (c.source ?? "Unknown");
  }

  // Filter applications in range
  const appsInRange = applications.filter((a) => inRange(a.applied_at, dateRange));

  // Group by source
  const bySource: Record<string, RawApplication[]> = {};
  for (const app of appsInRange) {
    const name = candidateSource[app.candidate_id] ?? "Unknown";
    if (!bySource[name]) bySource[name] = [];
    bySource[name].push(app);
  }

  // Compute org-wide max time-to-hire for speed index
  const allHireDays = appsInRange
    .filter((a) => a.status === "hired" && a.hired_at)
    .map((a) => daysBetween(a.applied_at, a.hired_at!));
  const maxHireDays = Math.max(1, ...allHireDays);

  const sourceMetrics: SourceMetric[] = Object.entries(bySource).map(([name, apps]) => {
    const total = apps.length;
    // Shortlisted = reached beyond the first stage (has stage history beyond initial)
    const shortlisted = apps.filter((a) =>
      a.status === "active" || a.status === "hired"
    ).length;
    const hired = apps.filter((a) => a.status === "hired").length;
    const hireDays = apps
      .filter((a) => a.status === "hired" && a.hired_at)
      .map((a) => daysBetween(a.applied_at, a.hired_at!));
    const avgHireDays = hireDays.length > 0
      ? round1(hireDays.reduce((s, d) => s + d, 0) / hireDays.length)
      : null;

    const hireRate = total > 0 ? round1(hired / total) : 0;
    const shortlistRate = total > 0 ? round1(shortlisted / total) : 0;
    const speedIndex = avgHireDays !== null ? round1(1 - avgHireDays / maxHireDays) : 0;
    const qualityScore = round1(hireRate * 0.5 + shortlistRate * 0.3 + speedIndex * 0.2);

    return {
      sourceName: name,
      applicationCount: total,
      shortlistRate,
      hireRate,
      avgTimeToHireDays: avgHireDays,
      qualityScore,
    };
  });

  // Sort by application count descending
  sourceMetrics.sort((a, b) => b.applicationCount - a.applicationCount);

  return {
    period: dateRange.from.toISOString().slice(0, 10),
    sources: sourceMetrics,
  };
}

// ── Team Analytics ───────────────────────────────────────────

export function computeTeamAnalytics(params: {
  jobs: RawJob[];
  applications: RawApplication[];
  interviews: RawInterview[];
  scorecards: RawScorecardSubmission[];
  profiles: RawUserProfile[];
  dateRange: DateRange;
}): TeamSnapshot {
  const { jobs, applications, interviews, scorecards, profiles, dateRange } = params;

  const profileNames: Record<string, string> = {};
  for (const p of profiles) profileNames[p.id] = p.full_name;

  const nowMs = Date.now();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // ── Recruiters ──
  const recruiterIds = [...new Set(jobs.map((j) => j.recruiter_id).filter(Boolean))] as string[];

  const recruiters: RecruiterMetric[] = recruiterIds.map((recruiterId) => {
    const recruiterJobs = jobs.filter((j) => j.recruiter_id === recruiterId);
    const openJobs = recruiterJobs.filter((j) => j.status === "open");
    const jobIds = new Set(recruiterJobs.map((j) => j.id));

    const recruiterApps = applications.filter((a) => jobIds.has(a.job_opening_id));
    const activeApps = recruiterApps.filter((a) => a.status === "active");
    const hiredThisMonth = recruiterApps.filter(
      (a) => a.status === "hired" && a.hired_at && new Date(a.hired_at) >= startOfMonth
    ).length;

    // Avg stage velocity: avg days in current stage for active apps
    const activeDays = activeApps
      .filter((a) => a.applied_at)
      .map((a) => (nowMs - new Date(a.applied_at).getTime()) / 86400000);
    const avgVelocity = activeDays.length > 0
      ? round1(activeDays.reduce((s, d) => s + d, 0) / activeDays.length)
      : null;

    // Feedback compliance: % of completed interviews with submitted scorecards
    const recruiterInterviews = interviews.filter(
      (i) => jobIds.has(i.job_opening_id) && i.status === "completed"
    );
    const withFeedback = recruiterInterviews.filter((i) =>
      scorecards.some((s) => s.interview_id === i.id)
    ).length;
    const complianceRate = recruiterInterviews.length > 0
      ? round1(withFeedback / recruiterInterviews.length)
      : 1;

    return {
      userId: recruiterId,
      name: profileNames[recruiterId] ?? "Unknown",
      openJobCount: openJobs.length,
      activePipelineCount: activeApps.length,
      avgStageVelocityDays: avgVelocity,
      hiredThisMonth,
      feedbackComplianceRate: complianceRate,
    };
  });

  // ── Interviewers ──
  const interviewerIds = [...new Set(interviews.map((i) => i.interviewer_id))];

  const interviewersMetrics: InterviewerMetric[] = interviewerIds.map((interviewerId) => {
    const myInterviews = interviews.filter(
      (i) => i.interviewer_id === interviewerId && inRange(i.created_at, dateRange)
    );
    const scheduled = myInterviews.filter((i) => i.status === "scheduled").length;
    const completed = myInterviews.filter((i) => i.status === "completed").length;

    // Overdue: scheduled but past scheduled_at and not completed
    const overdue = myInterviews.filter(
      (i) => i.status === "scheduled" && i.scheduled_at && new Date(i.scheduled_at).getTime() < nowMs
    ).length;

    // Avg feedback turnaround: time from interview completed to scorecard submitted
    const turnarounds: number[] = [];
    for (const interview of myInterviews.filter((i) => i.status === "completed" && i.completed_at)) {
      const scorecard = scorecards.find(
        (s) => s.interview_id === interview.id && s.submitted_by === interviewerId
      );
      if (scorecard) {
        const hours = (new Date(scorecard.created_at).getTime() - new Date(interview.completed_at!).getTime()) / 3600000;
        if (hours >= 0) turnarounds.push(hours);
      }
    }
    const avgTurnaround = turnarounds.length > 0
      ? round1(turnarounds.reduce((s, h) => s + h, 0) / turnarounds.length)
      : null;

    return {
      userId: interviewerId,
      name: profileNames[interviewerId] ?? "Unknown",
      scheduledCount: scheduled,
      completedCount: completed,
      overdueCount: overdue,
      avgFeedbackTurnaroundHours: avgTurnaround,
    };
  });

  return {
    period: dateRange.from.toISOString().slice(0, 10),
    recruiters,
    interviewers: interviewersMetrics,
  };
}

// ── Job Analytics ────────────────────────────────────────────

export function computeJobHealthScore(params: {
  daysOpen: number;
  applicationCount: number;
  activeCount: number;
  stageVelocityDays: number;
  industryBenchmarkDays?: number;
}): number {
  const { daysOpen, applicationCount, activeCount, stageVelocityDays, industryBenchmarkDays = 35 } = params;

  // Factor 1: Application volume (0–1) — more apps = healthier
  const volumeScore = Math.min(1, applicationCount / 20);

  // Factor 2: Active pipeline depth (0–1) — more active = healthier
  const pipelineScore = Math.min(1, activeCount / 10);

  // Factor 3: Velocity (0–1) — faster = healthier
  const velocityScore = stageVelocityDays > 0
    ? Math.max(0, 1 - stageVelocityDays / industryBenchmarkDays)
    : 0.5;

  // Factor 4: Freshness (0–1) — newer = healthier
  const freshnessScore = Math.max(0, 1 - daysOpen / 90);

  // Weighted composite
  const score = volumeScore * 0.25 + pipelineScore * 0.3 + velocityScore * 0.25 + freshnessScore * 0.2;

  return round1(Math.max(0, Math.min(1, score)));
}

export function predictTimeToFill(params: {
  currentActiveCount: number;
  avgStageVelocityDays: number;
  stagesRemaining: number;
  historicalFillRate: number;
}): number | null {
  const { currentActiveCount, avgStageVelocityDays, stagesRemaining, historicalFillRate } = params;

  if (currentActiveCount === 0 || historicalFillRate <= 0) return null;

  // Predicted days = stages remaining × avg velocity / fill rate
  const predicted = Math.round(stagesRemaining * avgStageVelocityDays / historicalFillRate);
  return Math.max(1, predicted);
}

export function computeJobAnalytics(params: {
  jobs: RawJob[];
  applications: RawApplication[];
  stageHistory: RawStageHistoryRow[];
  offers: RawOffer[];
  dateRange: DateRange;
}): JobSnapshot {
  const { jobs, applications, stageHistory, offers, dateRange } = params;

  const nowMs = Date.now();
  const openJobs = jobs.filter((j) => j.status === "open");

  const jobMetrics: JobMetric[] = openJobs.map((job) => {
    const jobApps = applications.filter((a) => a.job_opening_id === job.id);
    const activeApps = jobApps.filter((a) => a.status === "active");
    const hiredApps = jobApps.filter((a) => a.status === "hired");
    const pubDate = job.published_at ?? job.created_at;
    const daysOpen = Math.floor((nowMs - new Date(pubDate).getTime()) / 86400000);

    // Interviews and offers for this job
    const jobInterviewAppIds = new Set(
      stageHistory
        .filter((h) => jobApps.some((a) => a.id === h.application_id))
        .map((h) => h.application_id)
    );
    const interviewCount = jobInterviewAppIds.size;

    const jobOffers = offers.filter((o) => o.job_opening_id === job.id);

    // Conversion rate: hired / total
    const conversionRate = jobApps.length > 0
      ? round1(hiredApps.length / jobApps.length)
      : 0;

    // Health score
    const healthScore = computeJobHealthScore({
      daysOpen,
      applicationCount: jobApps.length,
      activeCount: activeApps.length,
      stageVelocityDays: daysOpen > 0 ? daysOpen / Math.max(1, interviewCount) : 0,
    });

    // Predict fill days
    const predicted = predictTimeToFill({
      currentActiveCount: activeApps.length,
      avgStageVelocityDays: daysOpen > 0 ? daysOpen / Math.max(1, interviewCount) : 5,
      stagesRemaining: 3, // rough estimate
      historicalFillRate: hiredApps.length > 0 ? hiredApps.length / jobApps.length : 0.1,
    });

    return {
      jobId: job.id,
      title: job.title,
      department: job.department,
      daysOpen,
      applicationCount: jobApps.length,
      activeCount: activeApps.length,
      shortlistCount: activeApps.length, // simplified: active = shortlisted
      interviewCount,
      offerCount: jobOffers.length,
      conversionRate,
      healthScore,
      predictedFillDays: predicted,
    };
  });

  // Sort by health score ascending (worst first)
  jobMetrics.sort((a, b) => a.healthScore - b.healthScore);

  return {
    period: dateRange.from.toISOString().slice(0, 10),
    jobs: jobMetrics,
  };
}
