-- Hand-written, not generated. A rename is the one change drizzle-kit cannot
-- infer: dropping `hotels` and creating `venues` produces the same schema and
-- loses every row, and `push` would do exactly that unattended. ALTER ...
-- RENAME keeps the data and the foreign keys pointing at it.
--
-- Widening "hotel" to "venue" now, while one property exists, rather than
-- after apartments, temples or stations are on it. The identity domain was
-- already neutral; this makes the other half match.

BEGIN;

ALTER TABLE "hotels" RENAME TO "venues";

ALTER TABLE "venues" RENAME COLUMN "chain_id" TO "operator_id";

-- What kind of arrival this venue has. Entry is reservation-led at a hotel,
-- membership-led at an apartment, open at a temple — everything already in the
-- table is a hotel.
ALTER TABLE "venues" ADD COLUMN "kind" text NOT NULL DEFAULT 'hotel';
ALTER TABLE "venues" ADD CONSTRAINT "venues_kind"
  CHECK ("kind" IN ('hotel','apartment','temple','station','office','other'));

ALTER TABLE "rooms" RENAME COLUMN "hotel_id" TO "venue_id";
ALTER TABLE "bookings" RENAME COLUMN "hotel_id" TO "venue_id";
ALTER TABLE "checkin_sessions" RENAME COLUMN "hotel_id" TO "venue_id";
ALTER TABLE "checkins" RENAME COLUMN "hotel_id" TO "venue_id";
ALTER TABLE "auth_events" RENAME COLUMN "hotel_id" TO "venue_id";

-- Constraint and index names are cosmetic, but a schema where they still say
-- "hotel" is a schema someone will misread a year from now.
ALTER TABLE "rooms" RENAME CONSTRAINT "rooms_hotel_id_hotels_id_fk" TO "rooms_venue_id_venues_id_fk";
ALTER TABLE "bookings" RENAME CONSTRAINT "bookings_hotel_id_hotels_id_fk" TO "bookings_venue_id_venues_id_fk";
ALTER TABLE "checkin_sessions" RENAME CONSTRAINT "checkin_sessions_hotel_id_hotels_id_fk" TO "checkin_sessions_venue_id_venues_id_fk";
ALTER TABLE "checkins" RENAME CONSTRAINT "checkins_hotel_id_hotels_id_fk" TO "checkins_venue_id_venues_id_fk";

ALTER INDEX "rooms_hotel_number_key" RENAME TO "rooms_venue_number_key";
ALTER INDEX "bookings_hotel_ref_key" RENAME TO "bookings_venue_ref_key";
ALTER INDEX "checkins_hotel_day" RENAME TO "checkins_venue_day";

COMMIT;
