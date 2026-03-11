import { describe, it, expect, vi, beforeEach } from "vitest";
import { TENANT_A } from "@/__fixtures__/golden-tenant";

// ── Mocks ──────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  return { mockFrom: vi.fn() };
});

function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.like = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);
  chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) =>
    resolve(resolveValue),
  );
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    userId: TENANT_A.users.owner.id,
    orgId: TENANT_A.org.id,
    orgRole: "owner",
    plan: "pro",
  }),
}));

vi.mock("@/lib/constants/roles", () => ({
  assertCan: vi.fn(),
  can: vi.fn().mockReturnValue(true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  generateAndStoreEmbedding: vi.fn().mockResolvedValue({ success: true }),
  buildJobEmbeddingText: vi.fn().mockReturnValue("Senior Software Engineer description"),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────

import { cloneJob, rewriteJobDescription, dismissChecklistItem } from "@/lib/actions/jobs";

// ── Test data ─────────────────────────────────────────────

const SOURCE_JOB_ID = TENANT_A.jobs.seniorEngineer.id;

const sourceJob = {
  title: "Senior Software Engineer",
  description: "Build great things.",
  department: "Engineering",
  location: "New York",
  location_type: "hybrid",
  employment_type: "full_time",
  salary_min: 120000,
  salary_max: 160000,
  salary_currency: "USD",
  headcount: 1,
  pipeline_template_id: TENANT_A.pipeline.template.id,
  hiring_manager_id: TENANT_A.users.owner.id,
  recruiter_id: TENANT_A.users.admin.id,
};

const sourceSkills = [
  { skill_id: "skill-uuid-001", importance: "must_have" },
  { skill_id: "skill-uuid-002", importance: "nice_to_have" },
];

// ── cloneJob tests ────────────────────────────────────────

describe("cloneJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use the source title without appending '(Copy)'", async () => {
    // call 1: fetch source job
    const sourceFetchChain = createChainMock({ data: sourceJob, error: null });
    // call 2: fetch source skills
    const skillsFetchChain = createChainMock({ data: sourceSkills, error: null });
    // call 3: slug availability check
    const slugCheckChain = createChainMock({ data: [], error: null });
    // call 4: insert clone — capture args
    const insertChain = createChainMock({ data: { id: "new-clone-id" }, error: null });
    // call 5: insert cloned skills
    const skillsInsertChain = createChainMock({ data: null, error: null });

    let jobOpeningsCall = 0;
    let jobSkillsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        jobOpeningsCall++;
        if (jobOpeningsCall === 1) return sourceFetchChain;
        if (jobOpeningsCall === 2) return slugCheckChain;
        return insertChain;
      }
      if (table === "job_required_skills") {
        jobSkillsCall++;
        return jobSkillsCall === 1 ? skillsFetchChain : skillsInsertChain;
      }
      return createChainMock();
    });

    await cloneJob(SOURCE_JOB_ID);

    // The insert chain's insert() should have been called with source.title (not "... (Copy)")
    const insertCall = insertChain.insert!.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertCall?.title).toBe("Senior Software Engineer");
    expect(String(insertCall?.title ?? "")).not.toContain("(Copy)");
  });

  it("should generate a slug without a timestamp suffix", async () => {
    const sourceFetchChain = createChainMock({ data: sourceJob, error: null });
    const skillsFetchChain = createChainMock({ data: [], error: null });
    const slugCheckChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: { id: "new-clone-id" }, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        jobOpeningsCall++;
        if (jobOpeningsCall === 1) return sourceFetchChain;
        if (jobOpeningsCall === 2) return slugCheckChain;
        return insertChain;
      }
      return table === "job_required_skills" ? skillsFetchChain : createChainMock();
    });

    await cloneJob(SOURCE_JOB_ID);

    const insertCall = insertChain.insert!.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const slug = String(insertCall?.slug ?? "");
    // Should be a clean slug — no 13-digit timestamp
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toMatch(/\d{10,}/);
    expect(slug).toBe("senior-software-engineer");
  });

  it("should copy job_required_skills from the source job", async () => {
    const sourceFetchChain = createChainMock({ data: sourceJob, error: null });
    const skillsFetchChain = createChainMock({ data: sourceSkills, error: null });
    const slugCheckChain = createChainMock({ data: [], error: null });
    const insertJobChain = createChainMock({ data: { id: "new-clone-id" }, error: null });
    const insertSkillsChain = createChainMock({ data: null, error: null });

    let jobOpeningsCall = 0;
    let jobSkillsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        jobOpeningsCall++;
        if (jobOpeningsCall === 1) return sourceFetchChain;
        if (jobOpeningsCall === 2) return slugCheckChain;
        return insertJobChain;
      }
      if (table === "job_required_skills") {
        jobSkillsCall++;
        return jobSkillsCall === 1 ? skillsFetchChain : insertSkillsChain;
      }
      return createChainMock();
    });

    await cloneJob(SOURCE_JOB_ID);

    // Skills INSERT should have been called with both source skills mapped to new job_id
    const insertArgs = insertSkillsChain.insert!.mock.calls[0]?.[0] as Array<{
      job_id: string;
      skill_id: string;
      importance: string;
    }>;
    expect(insertArgs).toHaveLength(2);
    expect(insertArgs[0]).toMatchObject({
      job_id: "new-clone-id",
      skill_id: "skill-uuid-001",
      importance: "must_have",
    });
    expect(insertArgs[1]).toMatchObject({
      job_id: "new-clone-id",
      skill_id: "skill-uuid-002",
      importance: "nice_to_have",
    });
  });

  it("should return error when source job is not found (cross-tenant isolation)", async () => {
    // Source job SELECT returns null — happens when jobId belongs to another org
    // because the WHERE clause includes eq("organization_id", session.orgId)
    const notFoundChain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(notFoundChain);

    const result = await cloneJob("foreign-org-job-id");
    expect(result).toEqual({ error: "Job not found." });

    // Verify no INSERT was attempted
    expect(notFoundChain.insert).not.toHaveBeenCalled();
  });

  it("should clone hiring_manager_id and recruiter_id from the source job", async () => {
    const sourceFetchChain = createChainMock({ data: sourceJob, error: null });
    const skillsFetchChain = createChainMock({ data: [], error: null });
    const slugCheckChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: { id: "new-clone-id" }, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        jobOpeningsCall++;
        if (jobOpeningsCall === 1) return sourceFetchChain;
        if (jobOpeningsCall === 2) return slugCheckChain;
        return insertChain;
      }
      return table === "job_required_skills" ? skillsFetchChain : createChainMock();
    });

    await cloneJob(SOURCE_JOB_ID);

    const insertCall = insertChain.insert!.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertCall?.hiring_manager_id).toBe(TENANT_A.users.owner.id);
    expect(insertCall?.recruiter_id).toBe(TENANT_A.users.admin.id);
  });

  it("should store clone_intent in metadata when intent is provided", async () => {
    const sourceFetchChain = createChainMock({ data: sourceJob, error: null });
    const skillsFetchChain = createChainMock({ data: [], error: null });
    const slugCheckChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: { id: "new-clone-id" }, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        jobOpeningsCall++;
        if (jobOpeningsCall === 1) return sourceFetchChain;
        if (jobOpeningsCall === 2) return slugCheckChain;
        return insertChain;
      }
      return table === "job_required_skills" ? skillsFetchChain : createChainMock();
    });

    const intent = { reason: "new_location" as const, newLocation: "London" };
    await cloneJob(SOURCE_JOB_ID, intent);

    const insertCall = insertChain.insert!.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertCall?.metadata).toEqual({ clone_intent: intent });
  });

  it("should use empty metadata when intent is null (skip)", async () => {
    const sourceFetchChain = createChainMock({ data: sourceJob, error: null });
    const skillsFetchChain = createChainMock({ data: [], error: null });
    const slugCheckChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: { id: "new-clone-id" }, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        jobOpeningsCall++;
        if (jobOpeningsCall === 1) return sourceFetchChain;
        if (jobOpeningsCall === 2) return slugCheckChain;
        return insertChain;
      }
      return table === "job_required_skills" ? skillsFetchChain : createChainMock();
    });

    await cloneJob(SOURCE_JOB_ID, null);

    const insertCall = insertChain.insert!.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertCall?.metadata).toEqual({});
  });

  it("should queue embedding generation for the cloned job", async () => {
    const { generateAndStoreEmbedding } = await import("@/lib/ai/embeddings");

    const sourceFetchChain = createChainMock({ data: sourceJob, error: null });
    const skillsFetchChain = createChainMock({ data: [], error: null });
    const slugCheckChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: { id: "new-clone-id" }, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        jobOpeningsCall++;
        if (jobOpeningsCall === 1) return sourceFetchChain;
        if (jobOpeningsCall === 2) return slugCheckChain;
        return insertChain;
      }
      return table === "job_required_skills" ? skillsFetchChain : createChainMock();
    });

    await cloneJob(SOURCE_JOB_ID);

    expect(generateAndStoreEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "new-clone-id", entityType: "job_opening" }),
    );
  });
});

// ── rewriteJobDescription tests ───────────────────────────

describe("rewriteJobDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should store the original description in description_previous before overwriting", async () => {
    const originalDescription = "The original recruiter-crafted description.";

    const fetchChain = createChainMock({
      data: { title: "Senior Software Engineer", department: "Engineering", description: originalDescription },
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation(() => {
      jobOpeningsCall++;
      return jobOpeningsCall === 1 ? fetchChain : updateChain;
    });

    // Mock generateJobDescription to return a new description
    vi.doMock("@/lib/ai/generate", () => ({
      generateJobDescription: vi.fn().mockResolvedValue({
        text: "AI-generated improved description.",
        error: undefined,
      }),
    }));

    await rewriteJobDescription("some-job-id");

    const updateArgs = updateChain.update!.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(updateArgs?.description_previous).toBe(originalDescription);
    expect(updateArgs?.description).toBe("AI-generated improved description.");
  });

  it("should return error and skip DB update when AI credits are exhausted", async () => {
    const fetchChain = createChainMock({
      data: { title: "Senior Software Engineer", department: "Engineering", description: "Original." },
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation(() => {
      jobOpeningsCall++;
      return jobOpeningsCall === 1 ? fetchChain : updateChain;
    });

    vi.doMock("@/lib/ai/generate", () => ({
      generateJobDescription: vi.fn().mockResolvedValue({
        text: null,
        error: "Insufficient AI credits",
      }),
    }));

    const result = await rewriteJobDescription("some-job-id");

    expect(result).toEqual({ error: "Insufficient AI credits" });
    // description_previous must NOT be written — original is preserved
    expect(updateChain.update).not.toHaveBeenCalled();
  });
});

// ── dismissChecklistItem tests (D4) ───────────────────────

describe("dismissChecklistItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should merge dismissed item into existing metadata without clobbering other keys", async () => {
    const existingMeta = { clone_intent: { reason: "new_location", newLocation: "London" }, clone_checklist_dismissed: { title_updated: true } };
    const fetchChain = createChainMock({ data: { metadata: existingMeta }, error: null });
    const updateChain = createChainMock({ data: null, error: null });

    let jobOpeningsCall = 0;
    mockFrom.mockImplementation(() => {
      jobOpeningsCall++;
      return jobOpeningsCall === 1 ? fetchChain : updateChain;
    });

    await dismissChecklistItem("job-id", "skills_reviewed");

    const updateArgs = updateChain.update!.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const updatedMeta = updateArgs?.metadata as Record<string, unknown> | undefined;
    expect(updatedMeta?.clone_checklist_dismissed).toEqual({ title_updated: true, skills_reviewed: true });
    expect(updatedMeta?.clone_intent).toEqual(existingMeta.clone_intent);
  });

  it("should return error when job is not found in org", async () => {
    const notFoundChain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(notFoundChain);

    const result = await dismissChecklistItem("foreign-job-id", "title_updated");
    expect(result).toEqual({ error: "Job not found." });
    expect(notFoundChain.update).not.toHaveBeenCalled();
  });
});
