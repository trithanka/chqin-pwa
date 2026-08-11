-- Correct the bit indices. Postgres numbers bytea bits from the *least*
-- significant bit within each byte (byteaGetBit uses `1 << (n % 8)`), so the
-- high nibble of byte 6 is bits 52-55 with bit 55 as the most significant —
-- not 48-51 as the left-to-right reading suggests.
--
--   version 7 (0111) → bit 55 = 0, bits 54,53,52 = 1
--   variant  (10xx)  → bit 71 = 1, bit 70 = 0

BEGIN;

CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid AS $$
  SELECT encode(
    set_bit(set_bit(set_bit(set_bit(set_bit(set_bit(
      overlay(
        gen_random_bytes(16)
        PLACING substring(
          int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3
        )
        FROM 1 FOR 6
      ),
      55, 0), 54, 1), 53, 1), 52, 1),  -- version 7
      71, 1), 70, 0),                  -- variant 10xx
    'hex')::uuid;
$$ LANGUAGE sql VOLATILE;

COMMIT;
