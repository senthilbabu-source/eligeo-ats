/**
 * Golden Tenant Fixture — deterministic test data for RLS and integration tests.
 *
 * UUID structure: XXXXXXXX-TTTT-4xxx-axxx-xxxxxxxxxxxx
 *   - XXXXXXXX: tenant prefix (11111111 = TENANT_A, 22222222 = TENANT_B)
 *   - TTTT: type code (1001 = user, 2001 = org, 3001 = job, 4001 = candidate, etc.)
 *
 * TENANT_A = itecbrains (real company, staffing & consulting)
 * TENANT_B = Globex Inc (fictional competitor for cross-tenant RLS tests)
 *
 * See D24 Testing Strategy for full specification.
 */

export const TENANT_A = {
  org: {
    id: "11111111-2001-4000-a000-000000000001",
    name: "itecbrains",
    slug: "itecbrains",
    plan: "pro" as const,
    custom_domain: "itecbrains.com",
  },
  users: {
    owner: {
      id: "11111111-1001-4000-a000-000000000001",
      email: "senthil@itecbrains.com",
      full_name: "Senthil Kumar Babu",
      role: "owner" as const,
    },
    admin: {
      id: "11111111-1001-4000-a000-000000000002",
      email: "prem@itecbrains.com",
      full_name: "Premkumar Govindarajulu",
      role: "admin" as const,
    },
    recruiter: {
      id: "11111111-1001-4000-a000-000000000003",
      email: "roshelle@itecbrains.com",
      full_name: "Roshelle Merandez",
      role: "recruiter" as const,
    },
    hiringManager: {
      id: "11111111-1001-4000-a000-000000000004",
      email: "hm@itecbrains.com",
      full_name: "Jordan Rivera",
      role: "hiring_manager" as const,
    },
    interviewer: {
      id: "11111111-1001-4000-a000-000000000005",
      email: "interviewer@itecbrains.com",
      full_name: "Taylor Chen",
      role: "interviewer" as const,
    },
  },
  jobs: {
    seniorEngineer: {
      id: "11111111-3001-4000-a000-000000000001",
      title: "Senior Software Engineer",
      status: "published" as const,
    },
    productManager: {
      id: "11111111-3001-4000-a000-000000000002",
      title: "Product Manager",
      status: "draft" as const,
    },
  },
  candidates: {
    alice: {
      id: "11111111-4001-4000-a000-000000000001",
      first_name: "Alice",
      last_name: "Johnson",
      email: "alice@example.com",
    },
    bob: {
      id: "11111111-4001-4000-a000-000000000002",
      first_name: "Bob",
      last_name: "Smith",
      email: "bob@example.com",
    },
    carol: {
      id: "11111111-4001-4000-a000-000000000003",
      first_name: "Carol",
      last_name: "Williams",
      email: "carol@example.com",
    },
  },
  applications: {
    aliceForEngineer: {
      id: "11111111-5001-4000-a000-000000000001",
      candidate_id: "11111111-4001-4000-a000-000000000001",
      job_id: "11111111-3001-4000-a000-000000000001",
      status: "active" as const,
    },
    bobForEngineer: {
      id: "11111111-5001-4000-a000-000000000002",
      candidate_id: "11111111-4001-4000-a000-000000000002",
      job_id: "11111111-3001-4000-a000-000000000001",
      status: "active" as const,
    },
  },
  interviews: {
    aliceScreening: {
      id: "11111111-7001-4000-a000-000000000001",
      application_id: "11111111-5001-4000-a000-000000000001",
      job_id: "11111111-3001-4000-a000-000000000001",
      interviewer_id: "11111111-1001-4000-a000-000000000003",
      interview_type: "phone_screen" as const,
      status: "completed" as const,
    },
    aliceTechnical: {
      id: "11111111-7001-4000-a000-000000000002",
      application_id: "11111111-5001-4000-a000-000000000001",
      job_id: "11111111-3001-4000-a000-000000000001",
      interviewer_id: "11111111-1001-4000-a000-000000000005",
      interview_type: "technical" as const,
      status: "scheduled" as const,
    },
  },
  scorecardTemplates: {
    engineering: {
      id: "11111111-7003-4000-a000-000000000001",
      name: "Engineering Interview",
    },
  },
  scorecardCategories: {
    technicalSkills: {
      id: "11111111-7004-4000-a000-000000000001",
      template_id: "11111111-7003-4000-a000-000000000001",
      name: "Technical Skills",
      position: 0,
      weight: 2.0,
    },
    communication: {
      id: "11111111-7004-4000-a000-000000000002",
      template_id: "11111111-7003-4000-a000-000000000001",
      name: "Communication",
      position: 1,
      weight: 1.0,
    },
  },
  scorecardAttributes: {
    systemDesign: {
      id: "11111111-7005-4000-a000-000000000001",
      category_id: "11111111-7004-4000-a000-000000000001",
      name: "System Design",
    },
    codeQuality: {
      id: "11111111-7005-4000-a000-000000000002",
      category_id: "11111111-7004-4000-a000-000000000001",
      name: "Code Quality",
    },
    clarityOfThought: {
      id: "11111111-7005-4000-a000-000000000003",
      category_id: "11111111-7004-4000-a000-000000000002",
      name: "Clarity of Thought",
    },
  },
  scorecardSubmissions: {
    screeningFeedback: {
      id: "11111111-7002-4000-a000-000000000001",
      interview_id: "11111111-7001-4000-a000-000000000001",
      application_id: "11111111-5001-4000-a000-000000000001",
      submitted_by: "11111111-1001-4000-a000-000000000003",
      recommendation: "strong_yes" as const,
    },
  },
  scorecardRatings: {
    systemDesignRating: {
      id: "11111111-7006-4000-a000-000000000001",
      submission_id: "11111111-7002-4000-a000-000000000001",
      attribute_id: "11111111-7005-4000-a000-000000000001",
      rating: 4,
    },
    codeQualityRating: {
      id: "11111111-7006-4000-a000-000000000002",
      submission_id: "11111111-7002-4000-a000-000000000001",
      attribute_id: "11111111-7005-4000-a000-000000000002",
      rating: 5,
    },
    clarityRating: {
      id: "11111111-7006-4000-a000-000000000003",
      submission_id: "11111111-7002-4000-a000-000000000001",
      attribute_id: "11111111-7005-4000-a000-000000000003",
      rating: 5,
    },
  },
  offerTemplates: {
    engineering: {
      id: "11111111-8002-4000-a000-000000000001",
      name: "Engineering Offer Template",
      department: "Engineering",
      compensation: {
        base_salary: 130000,
        currency: "USD",
        period: "annual",
      },
      terms_template: "Standard engineering offer terms. Start date: {{start_date}}.",
    },
  },
  offers: {
    aliceDraft: {
      id: "11111111-8001-4000-a000-000000000001",
      application_id: "11111111-5001-4000-a000-000000000001",
      candidate_id: "11111111-4001-4000-a000-000000000001",
      job_id: "11111111-3001-4000-a000-000000000001",
      template_id: "11111111-8002-4000-a000-000000000001",
      status: "draft" as const,
      compensation: { base_salary: 120000, currency: "USD", period: "annual" as const },
    },
  },
  offerApprovals: {
    aliceApprovalHM: {
      id: "11111111-8003-4000-a000-000000000001",
      offer_id: "11111111-8001-4000-a000-000000000001",
      approver_id: "11111111-1001-4000-a000-000000000004", // Jordan (HM)
      sequence_order: 1,
      status: "pending" as const,
    },
  },
  emailTemplates: {
    interviewInvite: {
      id: "11111111-a001-4000-a000-000000000001",
      name: "Interview Invitation",
      category: "interview_invite" as const,
      is_system: true,
    },
    rejection: {
      id: "11111111-a001-4000-a000-000000000002",
      name: "Application Rejection",
      category: "rejection" as const,
      is_system: true,
    },
    offer: {
      id: "11111111-a001-4000-a000-000000000003",
      name: "Offer Letter",
      category: "offer" as const,
      is_system: true,
    },
    followUp: {
      id: "11111111-a001-4000-a000-000000000004",
      name: "Follow Up",
      category: "follow_up" as const,
      is_system: true,
    },
    nurture: {
      id: "11111111-a001-4000-a000-000000000005",
      name: "Talent Nurture",
      category: "nurture" as const,
      is_system: true,
    },
    customScreening: {
      id: "11111111-a001-4000-a000-000000000006",
      name: "Custom Screening Invite",
      category: "custom" as const,
      is_system: false,
    },
  },
  notificationPreferences: {
    recruiterAppNew: {
      id: "11111111-a002-4000-a000-000000000001",
      user_id: "11111111-1001-4000-a000-000000000003", // Roshelle
      event_type: "application.new",
      channel: "both" as const,
    },
    recruiterScorecard: {
      id: "11111111-a002-4000-a000-000000000002",
      user_id: "11111111-1001-4000-a000-000000000003", // Roshelle
      event_type: "scorecard.submitted",
      channel: "email" as const,
    },
  },
  notes: {
    onAlice: {
      id: "11111111-9001-4000-a000-000000000001",
      body: "Strong technical background. Recommended for next round.",
    },
    replyToAlice: {
      id: "11111111-9001-4000-a000-000000000002",
      parent_id: "11111111-9001-4000-a000-000000000001",
      body: "Agreed. Let's schedule the technical interview.",
    },
  },
  pipeline: {
    template: {
      id: "11111111-6001-4000-a000-000000000001",
      name: "Standard Engineering Pipeline",
    },
    stages: {
      applied: { id: "11111111-6002-4000-a000-000000000001", name: "Applied", position: 0 },
      screening: { id: "11111111-6002-4000-a000-000000000002", name: "Screening", position: 1 },
      technical: { id: "11111111-6002-4000-a000-000000000003", name: "Technical", position: 2 },
      onsite: { id: "11111111-6002-4000-a000-000000000004", name: "Onsite", position: 3 },
      offer: { id: "11111111-6002-4000-a000-000000000005", name: "Offer", position: 4 },
      hired: { id: "11111111-6002-4000-a000-000000000006", name: "Hired", position: 5 },
    },
  },
} as const;

export const TENANT_B = {
  org: {
    id: "22222222-2001-4000-a000-000000000001",
    name: "Globex Inc",
    slug: "globex-inc",
    plan: "starter" as const,
  },
  users: {
    owner: {
      id: "22222222-1001-4000-a000-000000000001",
      email: "owner@globex-test.com",
      full_name: "Morgan Globex",
      role: "owner" as const,
    },
    recruiter: {
      id: "22222222-1001-4000-a000-000000000002",
      email: "recruiter@globex-test.com",
      full_name: "Casey Globex",
      role: "recruiter" as const,
    },
  },
  pipeline: {
    template: {
      id: "22222222-6001-4000-a000-000000000001",
      name: "Standard Pipeline",
    },
  },
  jobs: {
    pythonDeveloper: {
      id: "22222222-3001-4000-a000-000000000001",
      title: "Python Developer",
      status: "draft" as const,
    },
  },
  candidates: {
    dave: {
      id: "22222222-4001-4000-a000-000000000001",
      first_name: "Dave",
      last_name: "Brown",
      email: "dave@example.com",
    },
  },
  applications: {
    daveForPython: {
      id: "22222222-5001-4000-a000-000000000001",
      candidate_id: "22222222-4001-4000-a000-000000000001",
      job_id: "22222222-3001-4000-a000-000000000001",
      status: "active" as const,
    },
  },
  jobSkills: {
    pythonRequired: {
      id: "22222222-6008-4000-a000-000000000001",
    },
  },
  offerTemplates: {
    sales: {
      id: "22222222-8002-4000-a000-000000000001",
      name: "Sales Offer Template",
      department: "Sales",
    },
  },
  offers: {
    daveDraft: {
      id: "22222222-8001-4000-a000-000000000001",
      status: "draft" as const,
      compensation: { base_salary: 95000, currency: "USD", period: "annual" as const },
    },
  },
  emailTemplates: {
    interviewInvite: {
      id: "22222222-a001-4000-a000-000000000001",
      name: "Interview Invitation",
      category: "interview_invite" as const,
      is_system: true,
    },
  },
  notificationPreferences: {
    ownerAppNew: {
      id: "22222222-a002-4000-a000-000000000001",
      user_id: "22222222-1001-4000-a000-000000000001", // Morgan
      event_type: "application.new",
      channel: "in_app" as const,
    },
  },
} as const;
