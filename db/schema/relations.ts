import { relations } from "drizzle-orm";
import {
  additionalCharges,
  auditLogs,
  guests,
  hotels,
  housekeepingTasks,
  payments,
  reservationStatusHistory,
  reservations,
  roomTypes,
  rooms,
  users,
} from "./tables";

export const hotelsRelations = relations(hotels, ({ many }) => ({
  users: many(users),
  rooms: many(rooms),
  roomTypes: many(roomTypes),
}));

export const usersRelations = relations(users, ({ one }) => ({
  hotel: one(hotels, { fields: [users.hotelId], references: [hotels.id] }),
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
  hotel: one(hotels, { fields: [roomTypes.hotelId], references: [hotels.id] }),
  rooms: many(rooms),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  hotel: one(hotels, { fields: [rooms.hotelId], references: [hotels.id] }),
  roomType: one(roomTypes, { fields: [rooms.roomTypeId], references: [roomTypes.id] }),
  reservations: many(reservations),
  housekeepingTasks: many(housekeepingTasks),
}));

export const guestsRelations = relations(guests, ({ many }) => ({
  reservations: many(reservations),
}));

export const reservationsRelations = relations(reservations, ({ one, many }) => ({
  guest: one(guests, { fields: [reservations.guestId], references: [guests.id] }),
  room: one(rooms, { fields: [reservations.roomId], references: [rooms.id] }),
  creator: one(users, { fields: [reservations.createdBy], references: [users.id] }),
  payments: many(payments),
  charges: many(additionalCharges),
  statusHistory: many(reservationStatusHistory),
}));

export const reservationStatusHistoryRelations = relations(reservationStatusHistory, ({ one }) => ({
  reservation: one(reservations, {
    fields: [reservationStatusHistory.reservationId],
    references: [reservations.id],
  }),
  user: one(users, { fields: [reservationStatusHistory.changedBy], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  reservation: one(reservations, { fields: [payments.reservationId], references: [reservations.id] }),
  receiver: one(users, { fields: [payments.receivedBy], references: [users.id] }),
}));

export const additionalChargesRelations = relations(additionalCharges, ({ one }) => ({
  reservation: one(reservations, {
    fields: [additionalCharges.reservationId],
    references: [reservations.id],
  }),
  creator: one(users, { fields: [additionalCharges.createdBy], references: [users.id] }),
}));

export const housekeepingTasksRelations = relations(housekeepingTasks, ({ one }) => ({
  room: one(rooms, { fields: [housekeepingTasks.roomId], references: [rooms.id] }),
  assignee: one(users, { fields: [housekeepingTasks.assignedTo], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));
