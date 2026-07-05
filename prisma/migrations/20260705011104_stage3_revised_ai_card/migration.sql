-- CreateTable
CREATE TABLE "TextbookTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TextbookNodeMapping" (
    "textbookTopicId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,

    PRIMARY KEY ("textbookTopicId", "nodeId"),
    CONSTRAINT "TextbookNodeMapping_textbookTopicId_fkey" FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseAiResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "questionSummary" TEXT,
    "questionSummaryEdited" BOOLEAN NOT NULL DEFAULT false,
    "transcript" TEXT,
    "textbookTopicId" TEXT,
    "textbookTopicConfidence" REAL NOT NULL DEFAULT 0.0,
    "textbookTopicEdited" BOOLEAN NOT NULL DEFAULT false,
    "initialFeedback" TEXT,
    "possibleMistakeReason" TEXT,
    "nextActionSuggestion" TEXT,
    "audioStatus" TEXT NOT NULL DEFAULT 'skipped',
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "tokenUsage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaseAiResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaseAiResult_textbookTopicId_fkey" FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseTextbookTopicTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "textbookTopicId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseTextbookTopicTag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaseTextbookTopicTag_textbookTopicId_fkey" FOREIGN KEY ("textbookTopicId") REFERENCES "TextbookTopic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TextbookTopic_stage_order_idx" ON "TextbookTopic"("stage", "order");

-- CreateIndex
CREATE INDEX "TextbookNodeMapping_nodeId_idx" ON "TextbookNodeMapping"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAiResult_caseId_key" ON "CaseAiResult"("caseId");

-- CreateIndex
CREATE INDEX "CaseAiResult_textbookTopicId_idx" ON "CaseAiResult"("textbookTopicId");

-- CreateIndex
CREATE INDEX "CaseTextbookTopicTag_caseId_idx" ON "CaseTextbookTopicTag"("caseId");

-- CreateIndex
CREATE INDEX "CaseTextbookTopicTag_textbookTopicId_idx" ON "CaseTextbookTopicTag"("textbookTopicId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseTextbookTopicTag_caseId_textbookTopicId_source_key" ON "CaseTextbookTopicTag"("caseId", "textbookTopicId", "source");
