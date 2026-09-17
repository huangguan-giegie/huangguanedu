-- AlterTable
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "entitlementId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lockedHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourseSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "StudentEntitlement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("cancelledAt", "createdAt", "id", "lockedHours", "slotId", "status", "studentId") SELECT "cancelledAt", "createdAt", "id", "lockedHours", "slotId", "status", "studentId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_slotId_idx" ON "Booking"("slotId");
CREATE INDEX "Booking_studentId_idx" ON "Booking"("studentId");
CREATE INDEX "Booking_status_idx" ON "Booking"("status");
CREATE UNIQUE INDEX "Booking_studentId_slotId_key" ON "Booking"("studentId", "slotId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
