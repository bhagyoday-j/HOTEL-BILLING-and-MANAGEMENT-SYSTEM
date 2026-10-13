-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logoPath" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HotelSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HotelSetting_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" DECIMAL NOT NULL,
    "maxGuests" INTEGER NOT NULL DEFAULT 2,
    "amenities" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "roomTypeId" TEXT NOT NULL,
    "price" DECIMAL,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "idType" TEXT,
    "idNumber" TEXT,
    "nationality" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingNumber" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "checkInDate" DATETIME NOT NULL,
    "checkOutDate" DATETIME NOT NULL,
    "actualCheckIn" DATETIME,
    "actualCheckOut" DATETIME,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "roomRate" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "advancePayment" DECIMAL NOT NULL DEFAULT 0,
    "specialRequests" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Booking_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingGuest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingGuest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookingGuest_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "categoryId" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "taxRate" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT,
    "kitchenName" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "floor" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "RestaurantOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "kotNumber" TEXT,
    "orderType" TEXT NOT NULL DEFAULT 'DINE_IN',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tableId" TEXT,
    "roomId" TEXT,
    "bookingId" TEXT,
    "guestName" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "RestaurantOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestaurantOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tax" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rate" DECIMAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL,
    "value" DECIMAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guestId" TEXT,
    "guestName" TEXT,
    "guestMobile" TEXT,
    "roomId" TEXT,
    "bookingId" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalTax" DECIMAL NOT NULL DEFAULT 0,
    "roundingAmount" DECIMAL NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "pdfPath" TEXT,
    "createdById" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Invoice_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" DECIMAL NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL,
    "sourceType" TEXT,
    "sourceOrderId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "RestaurantOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentNumber" TEXT NOT NULL,
    "invoiceId" TEXT,
    "method" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "changeAmount" DECIMAL NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "cashSessionId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "openingCash" DECIMAL NOT NULL,
    "expectedCash" DECIMAL,
    "actualCash" DECIMAL,
    "difference" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CashSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyClosing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "closingDate" DATETIME NOT NULL,
    "cashSessionId" TEXT,
    "totalRevenue" DECIMAL NOT NULL DEFAULT 0,
    "roomRevenue" DECIMAL NOT NULL DEFAULT 0,
    "restaurantRevenue" DECIMAL NOT NULL DEFAULT 0,
    "otherRevenue" DECIMAL NOT NULL DEFAULT 0,
    "taxCollected" DECIMAL NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL NOT NULL DEFAULT 0,
    "cashCollected" DECIMAL NOT NULL DEFAULT 0,
    "upiCollected" DECIMAL NOT NULL DEFAULT 0,
    "cardCollected" DECIMAL NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL NOT NULL DEFAULT 0,
    "netCollection" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyClosing_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrinterSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purpose" TEXT NOT NULL,
    "printerName" TEXT,
    "paperFormat" TEXT NOT NULL DEFAULT 'A4',
    "silentPrint" BOOLEAN NOT NULL DEFAULT false,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "year" INTEGER,
    "prefix" TEXT NOT NULL,
    "currentVal" INTEGER NOT NULL DEFAULT 0,
    "padLength" INTEGER NOT NULL DEFAULT 6,
    "resetYearly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityRef" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "HotelSetting_hotelId_idx" ON "HotelSetting"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelSetting_hotelId_key_key" ON "HotelSetting"("hotelId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_name_key" ON "RoomType"("name");

-- CreateIndex
CREATE INDEX "RoomType_deletedAt_idx" ON "RoomType"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_number_key" ON "Room"("number");

-- CreateIndex
CREATE INDEX "Room_status_idx" ON "Room"("status");

-- CreateIndex
CREATE INDEX "Room_floor_idx" ON "Room"("floor");

-- CreateIndex
CREATE INDEX "Room_roomTypeId_idx" ON "Room"("roomTypeId");

-- CreateIndex
CREATE INDEX "Room_deletedAt_idx" ON "Room"("deletedAt");

-- CreateIndex
CREATE INDEX "Guest_fullName_idx" ON "Guest"("fullName");

-- CreateIndex
CREATE INDEX "Guest_mobile_idx" ON "Guest"("mobile");

-- CreateIndex
CREATE INDEX "Guest_idNumber_idx" ON "Guest"("idNumber");

-- CreateIndex
CREATE INDEX "Guest_deletedAt_idx" ON "Guest"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNumber_key" ON "Booking"("bookingNumber");

-- CreateIndex
CREATE INDEX "Booking_guestId_idx" ON "Booking"("guestId");

-- CreateIndex
CREATE INDEX "Booking_roomId_idx" ON "Booking"("roomId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_checkInDate_checkOutDate_idx" ON "Booking"("checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "Booking_deletedAt_idx" ON "Booking"("deletedAt");

-- CreateIndex
CREATE INDEX "BookingGuest_bookingId_idx" ON "BookingGuest"("bookingId");

-- CreateIndex
CREATE INDEX "BookingGuest_guestId_idx" ON "BookingGuest"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingGuest_bookingId_guestId_key" ON "BookingGuest"("bookingId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_name_key" ON "MenuCategory"("name");

-- CreateIndex
CREATE INDEX "MenuCategory_sortOrder_idx" ON "MenuCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "MenuCategory_deletedAt_idx" ON "MenuCategory"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_sku_key" ON "MenuItem"("sku");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");

-- CreateIndex
CREATE INDEX "MenuItem_deletedAt_idx" ON "MenuItem"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_name_key" ON "RestaurantTable"("name");

-- CreateIndex
CREATE INDEX "RestaurantTable_status_idx" ON "RestaurantTable"("status");

-- CreateIndex
CREATE INDEX "RestaurantTable_deletedAt_idx" ON "RestaurantTable"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrder_orderNumber_key" ON "RestaurantOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "RestaurantOrder_status_idx" ON "RestaurantOrder"("status");

-- CreateIndex
CREATE INDEX "RestaurantOrder_tableId_idx" ON "RestaurantOrder"("tableId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_roomId_idx" ON "RestaurantOrder"("roomId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_bookingId_idx" ON "RestaurantOrder"("bookingId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_createdAt_idx" ON "RestaurantOrder"("createdAt");

-- CreateIndex
CREATE INDEX "RestaurantOrder_deletedAt_idx" ON "RestaurantOrder"("deletedAt");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_orderId_idx" ON "RestaurantOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_menuItemId_idx" ON "RestaurantOrderItem"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Tax_code_key" ON "Tax"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Discount_code_key" ON "Discount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_guestId_idx" ON "Invoice"("guestId");

-- CreateIndex
CREATE INDEX "Invoice_roomId_idx" ON "Invoice"("roomId");

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_sourceOrderId_idx" ON "InvoiceItem"("sourceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNumber_key" ON "Payment"("paymentNumber");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_cashSessionId_idx" ON "Payment"("cashSessionId");

-- CreateIndex
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "Expense_userId_idx" ON "Expense"("userId");

-- CreateIndex
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");

-- CreateIndex
CREATE INDEX "CashSession_userId_idx" ON "CashSession"("userId");

-- CreateIndex
CREATE INDEX "CashSession_status_idx" ON "CashSession"("status");

-- CreateIndex
CREATE INDEX "CashSession_openedAt_idx" ON "CashSession"("openedAt");

-- CreateIndex
CREATE INDEX "DailyClosing_closingDate_idx" ON "DailyClosing"("closingDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosing_closingDate_key" ON "DailyClosing"("closingDate");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterSetting_purpose_key" ON "PrinterSetting"("purpose");

-- CreateIndex
CREATE INDEX "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");

-- CreateIndex
CREATE INDEX "BackupRecord_status_idx" ON "BackupRecord"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Sequence_key_idx" ON "Sequence"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_key_year_key" ON "Sequence"("key", "year");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
