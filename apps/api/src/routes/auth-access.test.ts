import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const configMock = vi.hoisted(() => ({
  registrationEnabled: true,
  jwtSecret: "test-secret",
  adminToken: "admin-secret",
  privacyPolicyUrl: "",
  privacyPolicyVersion: "v1"
}));

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  consentRecord: {
    createMany: vi.fn()
  },
  privacyAuditEvent: {
    create: vi.fn()
  }
}));

vi.mock("../config.js", () => ({
  config: configMock
}));

vi.mock("../db.js", () => ({
  prisma: prismaMock
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(async (password: string) => password === "password123"),
    hash: vi.fn(async () => "hash")
  }
}));

vi.mock("../middleware/auth.js", () => ({
  signToken: vi.fn(() => "jwt-token"),
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const header = req.headers.authorization;
    if (header === "Bearer admin-jwt") {
      req.user = { sub: "admin-1", email: "admin@example.com", isAdmin: true };
    } else if (header === "Bearer user-jwt") {
      req.user = { sub: "user-1", email: "user@example.com", isAdmin: false };
    }
    next();
  }
}));

import { authRouter } from "./auth.js";
import { adminRouter } from "./admin.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  return app;
}

describe("controlled registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMock.registrationEnabled = true;
    configMock.adminToken = "admin-secret";
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "new@example.com",
      passwordHash: "hash",
      status: "pending",
      isAdmin: false
    });
    prismaMock.consentRecord.createMany.mockResolvedValue({ count: 2 });
    prismaMock.privacyAuditEvent.create.mockResolvedValue({});
  });

  it("GET /api/auth/config exposes registration flag", async () => {
    configMock.registrationEnabled = false;
    const res = await request(createApp()).get("/api/auth/config");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      registrationEnabled: false,
      requiresApproval: true,
      privacyPolicyUrl: null,
      privacyPolicyVersion: "v1"
    });
  });

  it("POST /api/auth/register returns 403 when registration is disabled", async () => {
    configMock.registrationEnabled = false;
    const res = await request(createApp())
      .post("/api/auth/register")
      .send({
        email: "new@example.com",
        password: "password123",
        acceptedTerms: true,
        acceptedSensitiveDataProcessing: true
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Registration is not open");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("POST /api/auth/register creates a pending user without a token", async () => {
    const res = await request(createApp())
      .post("/api/auth/register")
      .send({
        email: "new@example.com",
        password: "password123",
        acceptedTerms: true,
        acceptedSensitiveDataProcessing: true
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toEqual({
      id: "user-1",
      email: "new@example.com",
      status: "pending"
    });
    expect(res.body.message).toContain("administrator");
    expect(prismaMock.user.create).toHaveBeenCalledOnce();
  });

  it("POST /api/auth/login returns 403 for pending accounts", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "new@example.com",
      passwordHash: "hash",
      status: "pending",
      isAdmin: false
    });

    const res = await request(createApp())
      .post("/api/auth/login")
      .send({ email: "new@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account pending approval");
  });

  it("POST /api/auth/login returns 403 for rejected accounts", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "new@example.com",
      passwordHash: "hash",
      status: "rejected",
      isAdmin: false
    });

    const res = await request(createApp())
      .post("/api/auth/login")
      .send({ email: "new@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account rejected");
  });

  it("POST /api/auth/login issues a token for approved users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "new@example.com",
      passwordHash: "hash",
      status: "approved",
      isAdmin: false
    });

    const res = await request(createApp())
      .post("/api/auth/login")
      .send({ email: "new@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("jwt-token");
    expect(res.body.user).toEqual({
      id: "user-1",
      email: "new@example.com",
      status: "approved",
      isAdmin: false
    });
  });

  it("POST /api/admin/users requires admin token", async () => {
    const res = await request(createApp())
      .post("/api/admin/users")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("POST /api/admin/users creates an approved user with valid admin token", async () => {
    prismaMock.user.create.mockResolvedValue({
      id: "user-2",
      email: "admin@example.com",
      passwordHash: "hash",
      status: "approved",
      isAdmin: false
    });

    const res = await request(createApp())
      .post("/api/admin/users")
      .set("x-admin-token", "admin-secret")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: "user-2",
      email: "admin@example.com",
      status: "approved",
      isAdmin: false
    });
    expect(prismaMock.user.create).toHaveBeenCalledOnce();
  });
});

describe("admin user approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string; sub?: string } }) => {
      if (where.id === "admin-1" || where.id === "pending-1") {
        return {
          id: where.id,
          email: where.id === "admin-1" ? "admin@example.com" : "pending@example.com",
          isAdmin: where.id === "admin-1"
        };
      }
      return null;
    });
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "pending-1",
        email: "pending@example.com",
        status: "pending",
        isAdmin: false,
        createdAt: new Date("2026-06-10")
      }
    ]);
    prismaMock.user.update.mockImplementation(async ({ where, data, select }: { where: { id: string }; data: { status?: string; isAdmin?: boolean }; select?: unknown }) => ({
      id: where.id,
      email: "pending@example.com",
      status: data.status ?? "approved",
      isAdmin: data.isAdmin ?? false,
      createdAt: new Date("2026-06-10"),
      ...(select ? {} : {})
    }));
  });

  it("GET /api/admin/users requires an admin user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false });

    const res = await request(createApp())
      .get("/api/admin/users?status=pending")
      .set("Authorization", "Bearer user-jwt");

    expect(res.status).toBe(403);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("GET /api/admin/users lists users for admin JWT", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: true });

    const res = await request(createApp())
      .get("/api/admin/users?status=pending")
      .set("Authorization", "Bearer admin-jwt");

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledOnce();
  });

  it("POST /api/admin/users/:id/approve updates user status", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ isAdmin: true })
      .mockResolvedValueOnce({
        id: "pending-1",
        email: "pending@example.com",
        status: "pending",
        isAdmin: false,
        createdAt: new Date("2026-06-10")
      });
    prismaMock.user.update.mockResolvedValue({
      id: "pending-1",
      email: "pending@example.com",
      status: "approved",
      isAdmin: false,
      createdAt: new Date("2026-06-10")
    });

    const res = await request(createApp())
      .post("/api/admin/users/pending-1/approve")
      .set("Authorization", "Bearer admin-jwt");

    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe("approved");
  });

  it("POST /api/admin/users/:id/reject updates user status", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ isAdmin: true })
      .mockResolvedValueOnce({
        id: "pending-1",
        email: "pending@example.com",
        status: "pending",
        isAdmin: false,
        createdAt: new Date("2026-06-10")
      });
    prismaMock.user.update.mockResolvedValue({
      id: "pending-1",
      email: "pending@example.com",
      status: "rejected",
      isAdmin: false,
      createdAt: new Date("2026-06-10")
    });

    const res = await request(createApp())
      .post("/api/admin/users/pending-1/reject")
      .set("Authorization", "Bearer admin-jwt");

    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe("rejected");
  });
});
