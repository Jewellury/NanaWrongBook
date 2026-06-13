-- CreateTable
CREATE TABLE "KnowledgeNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "judgeCriteria" TEXT NOT NULL,
    "sampleItem" TEXT,
    "teachingNotes" TEXT,
    "tier" TEXT,
    "videoLinks" TEXT
);

-- CreateTable
CREATE TABLE "KnowledgeEdge" (
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    PRIMARY KEY ("sourceId", "targetId"),
    CONSTRAINT "KnowledgeEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "KnowledgeNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mainline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "weight" REAL
);

-- CreateTable
CREATE TABLE "NodeMainline" (
    "nodeId" TEXT NOT NULL,
    "mainlineId" TEXT NOT NULL,

    PRIMARY KEY ("nodeId", "mainlineId"),
    CONSTRAINT "NodeMainline_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "KnowledgeNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NodeMainline_mainlineId_fkey" FOREIGN KEY ("mainlineId") REFERENCES "Mainline" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MainlineBridge" (
    "srcMainlineId" TEXT NOT NULL,
    "tgtMainlineId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,

    PRIMARY KEY ("srcMainlineId", "tgtMainlineId")
);

-- CreateTable
CREATE TABLE "StudentNodeState" (
    "studentId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "masteryProb" REAL NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'untested',
    "slipFlag" BOOLEAN NOT NULL DEFAULT false,
    "lastEvidence" DATETIME,

    PRIMARY KEY ("studentId", "nodeId"),
    CONSTRAINT "StudentNodeState_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "KnowledgeNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Misconception" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "crossTag" TEXT,
    "manifestation" TEXT NOT NULL,
    "misbelief" TEXT NOT NULL,
    "rootNodeId" TEXT,
    "probeCue" TEXT NOT NULL,
    "evidence" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MistakeNode" (
    "mistakeId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("mistakeId", "nodeId")
);
