-- The first uuid_v7() set two bits and hoped. RFC 9562 needs four version bits
-- (byte 6, high nibble = 0111) and two variant bits (byte 8, top bits = 10);
-- without all six, roughly half the output is not a valid v7 UUID and strict
-- parsers reject it.
--
-- set_bit() indexes bits from the left of the whole bytea, so byte 6's high
-- nibble is bits 48-51 and byte 8's top two bits are 64-65.

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
      48, 0), 49, 1), 50, 1), 51, 1),  -- version 7
      64, 1), 65, 0),                  -- variant 10xx
    'hex')::uuid;
$$ LANGUAGE sql VOLATILE;

COMMIT;
