ALTER TABLE "guests" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_gender" CHECK ("guests"."gender" IS NULL OR "guests"."gender" IN ('female','male','other','undisclosed'));