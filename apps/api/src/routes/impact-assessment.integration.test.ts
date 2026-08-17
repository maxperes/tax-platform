import express from "express";
import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const TWIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";

type PersonRow = {
  id: string;
  twinCaseId: string;
  fullName: string;
  role: string;
  livesInCountry: string | null;
  worksInCountry: string | null;
  hasIncome: boolean | null;
  hasWealth: boolean | null;
  hasInvestments: boolean | null;
  notes: string | null;
};

type TwinRow = {
  id: string;
  userId: string;
  taxYear: number;
  title: string;
  inventoryJson: unknown;
  interviewJson: unknown;
  asIsCompletion: number;
  createdAt: Date;
  updatedAt: Date;
};

type AssessmentRow = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  users: [{ id: "user-1", plan: "basic" as const }],
  twins: [] as TwinRow[],
  persons: [] as PersonRow[],
  assessments: [] as AssessmentRow[],
  personSeq: 0
}));

function withPersons(twin: TwinRow) {
  return {
    ...twin,
    persons: store.persons.filter((p) => p.twinCaseId === twin.id)
  };
}

const prismaMock = vi.hoisted(() => ({
  user: {
    findUniqueOrThrow: vi.fn(async ({ where, select }: { where: { id: string }; select?: { plan: boolean } }) => {
      const user = store.users.find((u) => u.id === where.id);
      if (!user) throw new Error("User not found");
      if (select?.plan) return { plan: user.plan };
      return user;
    })
  },
  twinCase: {
    findUnique: vi.fn(async ({ where }: { where: { userId_taxYear?: { userId: string; taxYear: number }; id?: string } }) => {
      const twin = where.userId_taxYear
        ? store.twins.find(
            (row) => row.userId === where.userId_taxYear!.userId && row.taxYear === where.userId_taxYear!.taxYear
          )
        : store.twins.find((row) => row.id === where.id);
      return twin ? withPersons(twin) : null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const twin = store.twins.find((row) => row.id === where.id);
      if (!twin) throw new Error("Twin case not found");
      return withPersons(twin);
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
      const twin = store.twins.find((row) => row.id === where.id && row.userId === where.userId);
      return twin ? withPersons(twin) : null;
    }),
    create: vi.fn(async ({ data }: { data: Omit<TwinRow, "id" | "createdAt" | "updatedAt" | "title" | "interviewJson"> & { title?: string; interviewJson?: unknown } }) => {
      const twin: TwinRow = {
        id: TWIN_ID,
        title: data.title ?? "Family Tax Twin",
        interviewJson: data.interviewJson ?? null,
        userId: data.userId,
        taxYear: data.taxYear,
        inventoryJson: data.inventoryJson,
        asIsCompletion: data.asIsCompletion,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      store.twins.push(twin);
      return withPersons(twin);
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        update
      }: {
        where: { userId_taxYear: { userId: string; taxYear: number } };
        create: {
          userId: string;
          taxYear: number;
          title?: string;
          inventoryJson: unknown;
          interviewJson?: unknown;
          asIsCompletion: number;
          persons?: { create: Array<Omit<PersonRow, "id" | "twinCaseId">> };
        };
        update: {
          title?: string;
          inventoryJson: unknown;
          interviewJson?: unknown;
          asIsCompletion: number;
        };
      }) => {
        const existing = store.twins.find(
          (row) => row.userId === where.userId_taxYear.userId && row.taxYear === where.userId_taxYear.taxYear
        );
        if (existing) {
          existing.title = update.title ?? existing.title;
          existing.inventoryJson = update.inventoryJson;
          if (update.interviewJson !== undefined) existing.interviewJson = update.interviewJson;
          existing.asIsCompletion = update.asIsCompletion;
          existing.updatedAt = new Date();
          return withPersons(existing);
        }
        const twin: TwinRow = {
          id: TWIN_ID,
          userId: create.userId,
          taxYear: create.taxYear,
          title: create.title ?? "Family Tax Twin",
          inventoryJson: create.inventoryJson,
          interviewJson: create.interviewJson ?? null,
          asIsCompletion: create.asIsCompletion,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        store.twins.push(twin);
        for (const person of create.persons?.create ?? []) {
          store.personSeq += 1;
          store.persons.push({
            id: `person-${store.personSeq}`,
            twinCaseId: twin.id,
            fullName: person.fullName,
            role: person.role,
            livesInCountry: person.livesInCountry ?? null,
            worksInCountry: person.worksInCountry ?? null,
            hasIncome: person.hasIncome ?? null,
            hasWealth: person.hasWealth ?? null,
            hasInvestments: person.hasInvestments ?? null,
            notes: person.notes ?? null
          });
        }
        return withPersons(twin);
      }
    )
  },
  twinPerson: {
    deleteMany: vi.fn(async ({ where }: { where: { twinCaseId: string } }) => {
      store.persons = store.persons.filter((p) => p.twinCaseId !== where.twinCaseId);
      return { count: 0 };
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Omit<PersonRow, "id">> }) => {
      for (const person of data) {
        store.personSeq += 1;
        store.persons.push({
          id: `person-${store.personSeq}`,
          ...person
        });
      }
      return { count: data.length };
    })
  },
  impactAssessment: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: AssessmentRow = {
        id: "assess-1",
        ...data
      };
      store.assessments.push(row);
      return row;
    })
  }
}));

vi.mock("../db.js", () => ({
  prisma: prismaMock
}));

vi.mock("../middleware/auth.js", () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (req.headers.authorization === "Bearer user-jwt") {
      req.user = { sub: USER_ID, email: "user@example.com", isAdmin: false };
    }
    next();
  }
}));

import { twinsRouter } from "./twins.js";
import { impactAssessmentsRouter } from "./impact-assessments.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/twins", twinsRouter);
  app.use("/api/impact-assessments", impactAssessmentsRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.flatten() });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

const auth = { Authorization: "Bearer user-jwt" };

const inventory = {
  residency: {
    firstEntryBrazilDate: "2026-03-01",
    entryPathway: "permanent_visa" as const,
    currentlyFiscalResidentBrazil: false,
    currentlyFiscalResidentUSA: true
  },
  countryFootprint: [
    { country: "US", hasTaxResidency: true, hasCitizenship: true, hasGreenCard: false },
    { country: "BR", hasTaxResidency: false }
  ],
  incomes: [
    {
      category: "salary",
      originCountry: "US",
      currency: "USD",
      annualAmount: 100000,
      taxPaidOrigin: 20000
    }
  ],
  assets: [{ name: "Home", assetType: "real_estate", country: "US", currentValue: 500000, currency: "USD" }],
  entities: [],
  trusts: [],
  financialAccountsSummary: []
};

const interview = {
  answers: {
    full_name: "Alex Example",
    citizenship: "us",
    residence_country: "us",
    currently_in_brazil: "no",
    first_entry_date: "2026-03-01",
    immigration_status: "permanent",
    income_types: ["salary"],
    income_salary_amount: "100000",
    income_salary_country: "us",
    income_salary_currency: "USD",
    income_salary_withholding: "20000",
    asset_types: ["real_estate"]
  },
  documents: {},
  followUps: {},
  assessmentComplete: true,
  documentsComplete: false,
  reviewRequested: false
};

describe("twin save → impact assessment run", () => {
  beforeEach(() => {
    store.twins = [];
    store.persons = [];
    store.assessments = [];
    store.personSeq = 0;
    store.users = [{ id: USER_ID, plan: "basic" }];
    vi.clearAllMocks();
  });

  it("ensures a twin, saves interview inventory, and returns a BR gross tax total", async () => {
    const app = createApp();

    const ensured = await request(app).post("/api/twins/ensure").set(auth).send({ taxYear: 2026 });
    expect(ensured.status).toBe(200);
    expect(ensured.body.id).toBe(TWIN_ID);
    expect(ensured.body.taxYear).toBe(2026);

    const saved = await request(app)
      .put("/api/twins")
      .set(auth)
      .send({
        taxYear: 2026,
        inventory,
        persons: [{ fullName: "Alex Example", role: "primary", livesInCountry: "US" }],
        interview
      });
    expect(saved.status).toBe(200);
    expect(saved.body.id).toBe(TWIN_ID);
    expect(saved.body.inventoryJson.incomes[0].annualAmount).toBe(100000);
    expect(saved.body.asIs.completionPercent).toBeGreaterThan(0);

    const ran = await request(app)
      .post("/api/impact-assessments/run")
      .set(auth)
      .send({
        twinCaseId: TWIN_ID,
        hypothesisResidencyDate: "2026-07-01",
        applyReliefs: false
      });

    expect(ran.status).toBe(201);
    expect(ran.body.assessment.id).toBe("assess-1");
    expect(store.assessments).toHaveLength(1);

    const estimated = ran.body.assessment.toBeJson.estimatedBrGrossTaxTotal;
    expect(typeof estimated).toBe("number");
    expect(estimated).toBeGreaterThan(0);
    expect(ran.body.report.layers.brazilImpact.estimatedBrGrossTaxTotal).toBe(estimated);
    expect(ran.body.assessment.summaryJson.estimatedBrGrossTaxTotal).toBe(estimated);
  });
});
