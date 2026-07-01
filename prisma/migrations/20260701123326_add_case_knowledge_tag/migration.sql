-- CreateTable
CREATE TABLE "CaseKnowledgeTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseKnowledgeTag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CaseKnowledgeTag_caseId_idx" ON "CaseKnowledgeTag"("caseId");

-- CreateIndex
CREATE INDEX "CaseKnowledgeTag_nodeId_idx" ON "CaseKnowledgeTag"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseKnowledgeTag_caseId_nodeId_source_key" ON "CaseKnowledgeTag"("caseId", "nodeId", "source");
