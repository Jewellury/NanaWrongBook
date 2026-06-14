-- CreateTable
CREATE TABLE "DiagnosisSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ProbeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT,
    "nodeId" TEXT,
    "correct" BOOLEAN NOT NULL,
    "durationS" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProbeRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosisSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErrorRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "mistakeId" TEXT,
    "nodeId" TEXT,
    "newmanStage" TEXT,
    "errorType" TEXT,
    "crossTag" TEXT,
    "rootNodeId" TEXT,
    "dialogueLog" TEXT,
    "evidenceRound" INTEGER,
    "followUpVerified" TEXT NOT NULL DEFAULT 'none',
    "confirmed" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErrorRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosisSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
