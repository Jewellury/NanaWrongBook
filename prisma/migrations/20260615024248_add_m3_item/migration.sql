-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "analysis" TEXT,
    "source" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Item_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "KnowledgeNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
