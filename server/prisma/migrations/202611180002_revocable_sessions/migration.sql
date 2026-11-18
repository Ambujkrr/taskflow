CREATE TABLE "Session" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
