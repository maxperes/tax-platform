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
    create: vi.fn()
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

vi.mock("../middleware/auth.js", () => ({
  signToken: vi.fn(() => "jwt-token"),
  authMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
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
      passwordHash: "hash"
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

  it("POST /api/auth/register creates a user when registration is enabled", async () => {
    const res = await request(createApp())
      .post("/api/auth/register")
      .send({
        email: "new@example.com",
        password: "password123",
        acceptedTerms: true,
        acceptedSensitiveDataProcessing: true
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe("jwt-token");
    expect(res.body.user.email).toBe("new@example.com");
    expect(prismaMock.user.create).toHaveBeenCalledOnce();
  });

  it("POST /api/admin/users requires admin token", async () => {
    const res = await request(createApp())
      .post("/api/admin/users")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("POST /api/admin/users creates a user with valid admin token", async () => {
    prismaMock.user.create.mockResolvedValue({
      id: "user-2",
      email: "admin@example.com",
      passwordHash: "hash"
    });

    const res = await request(createApp())
      .post("/api/admin/users")
      .set("x-admin-token", "admin-secret")
      .send({ email: "admin@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: "user-2", email: "admin@example.com" });
    expect(prismaMock.user.create).toHaveBeenCalledOnce();
  });
});
