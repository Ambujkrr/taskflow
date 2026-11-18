import { config } from "dotenv";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../src/db.js";
config({ path: "../.env", quiet: true });
// Never create a public shared account or reset an existing password.
const seed = z
  .object({
    SEED_EMAIL: z.email(),
    SEED_PASSWORD: z
      .string()
      .min(14)
      .refine((v) => Buffer.byteLength(v) <= 72),
    SEED_NAME: z.string().min(2).max(80).default("Ambuj"),
  })
  .safeParse(process.env);
if (!seed.success) {
  console.error(
    "Set SEED_EMAIL, SEED_PASSWORD (14–72 bytes), and optionally SEED_NAME in your private environment.",
  );
  await db.$disconnect();
  process.exit(1);
}
try {
  const existing = await db.user.findUnique({
    where: { email: seed.data.SEED_EMAIL.toLowerCase() },
  });
  if (existing) {
    console.log("Account already exists; no password or tasks changed.");
  } else {
    const date = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      return d;
    };
    await db.user.create({
      data: {
        name: seed.data.SEED_NAME,
        email: seed.data.SEED_EMAIL.toLowerCase(),
        passwordHash: await bcrypt.hash(seed.data.SEED_PASSWORD, 12),
        tasks: {
          create: [
            {
              title: "Polish the portfolio case study",
              description:
                "Explain the problem, architecture, tradeoffs, and what I learned building TaskFlow.",
              status: "IN_PROGRESS",
              priority: "HIGH",
              dueDate: date(2),
            },
            {
              title: "Prepare for the technical interview",
              description:
                "Practice explaining task ownership, JWT cookies, CSRF protection, and database indexes.",
              status: "TODO",
              priority: "HIGH",
              dueDate: date(4),
            },
            {
              title: "Review the API documentation",
              description:
                "Walk through request examples and confirm error responses are easy to understand.",
              status: "TODO",
              priority: "MEDIUM",
              dueDate: date(3),
            },
            {
              title: "Take the mobile experience for a spin",
              description:
                "Check navigation, task creation, forms, and keyboard focus on a small screen.",
              status: "TODO",
              priority: "MEDIUM",
              dueDate: date(5),
            },
            {
              title: "Build the PostgreSQL data model",
              description:
                "Create User and Task relations, ownership indexes, and a versioned migration.",
              status: "COMPLETED",
              priority: "HIGH",
              dueDate: date(-1),
            },
            {
              title: "Plan a quiet hour for learning",
              description:
                "Explore how the Node.js event loop handles I/O while requests run concurrently.",
              status: "TODO",
              priority: "LOW",
              dueDate: date(7),
            },
            {
              title: "Set up the project workspace",
              description:
                "Create the TypeScript monorepo and connect Express with React.",
              status: "COMPLETED",
              priority: "MEDIUM",
              dueDate: date(-2),
            },
            {
              title: "Write integration tests",
              description:
                "Verify authentication, task CRUD, dashboard counts, and cross-user isolation with PostgreSQL.",
              status: "IN_PROGRESS",
              priority: "MEDIUM",
              dueDate: date(1),
            },
          ],
        },
      },
    });
    console.log(
      "Private sample workspace created. Sign in using your configured seed credentials.",
    );
  }
} finally {
  await db.$disconnect();
}
